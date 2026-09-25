const RACE_SECONDS = 60;
const MAX_PLAYERS = 10;
const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
const PASSAGES = [
	'Pagi yang tenang memberi ruang untuk memulai lagi. Tarik napas, letakkan tangan di papan ketik, dan biarkan setiap kata menemukan ritmenya sendiri. Kecepatan akan datang ketika perhatian tetap berada pada kalimat yang sedang kamu tulis.',
	'Di sebuah kota kecil, lampu jalan menyala ketika langit mulai gelap. Orang-orang pulang membawa cerita dari hari yang panjang, sementara suara hujan tipis mengetuk jendela. Malam terasa sederhana, hangat, dan cukup untuk membuat semua orang beristirahat.',
	'Mengetik dengan baik bukan sekadar bergerak lebih cepat. Mata membaca beberapa kata ke depan, jari mengikuti dengan tenang, dan pikiran menjaga irama. Sedikit kesalahan dapat diperbaiki, lalu perjalanan dilanjutkan tanpa kehilangan fokus.'
];

function nicknameFrom(body) {
	const nickname = String(body.nickname || '')
		.trim()
		.replace(/\s+/g, ' ');
	if (nickname.length < 2 || nickname.length > 18 || /[<>\r\n\t]/.test(nickname)) {
		throw new BadRequestError('Nama harus 2–18 karakter tanpa tanda kurung sudut.');
	}
	return nickname;
}

function browserIdFrom(body) {
	const browserId = String(body.browser_id || '');
	if (!/^[a-f0-9]{32}$/.test(browserId)) {
		throw new BadRequestError('Identitas browser tidak valid. Muat ulang halaman.');
	}
	return browserId;
}

function roomByCode(app, code) {
	if (!/^[A-Z2-9]{8}$/.test(code)) throw new NotFoundError('Room tidak ditemukan.');
	try {
		const room = app.findFirstRecordByData('rooms', 'code', code);
		if (Date.parse(room.getString('expires_at')) <= Date.now())
			throw new NotFoundError('Room tidak ditemukan.');
		return room;
	} catch {
		throw new NotFoundError('Room tidak ditemukan.');
	}
}

function playersFor(app, room) {
	return app.findRecordsByFilter('race_players', 'room = {:room}', 'id', MAX_PLAYERS, 0, {
		room: room.id
	});
}

function publicPlayer(player) {
	return {
		id: player.id,
		nickname: player.getString('nickname'),
		avatar_index: player.getInt('avatar_index'),
		is_host: player.getBool('is_host'),
		finished_at: player.getString('finished_at'),
		correct_chars: player.getInt('correct_chars'),
		elapsed_ms: player.getInt('elapsed_ms'),
		wpm: player.getInt('wpm'),
		completed: player.getBool('completed'),
		gold_count: player.getInt('gold_count'),
		silver_count: player.getInt('silver_count'),
		bronze_count: player.getInt('bronze_count'),
		points: player.getInt('points')
	};
}

function publicRound(round) {
	return {
		id: round.id,
		number: round.getInt('number'),
		gold: round.getString('gold'),
		silver: round.getString('silver'),
		bronze: round.getString('bronze'),
		ended_at: round.getString('ended_at')
	};
}

function publicChatMessage(message) {
	return {
		id: message.id,
		player_id: message.getString('player'),
		nickname: message.getString('nickname'),
		text: message.getString('text'),
		sent_at: message.getString('created')
	};
}

function snapshot(app, room) {
	return {
		room: {
			id: room.id,
			code: room.getString('code'),
			passage: room.getString('passage'),
			status: room.getString('status'),
			starts_at: room.getString('starts_at'),
			duration_seconds: room.getInt('duration_seconds'),
			round_number: room.getInt('round_number'),
			round_finished_at: room.getString('round_finished_at'),
			competition_ended: room.getBool('competition_ended')
		},
		players: playersFor(app, room).map(publicPlayer),
		server_time: new Date().toISOString()
	};
}

function finalizeRound(app, room, now) {
	if (room.getString('status') !== 'running' || room.getString('round_finished_at')) return null;
	const players = playersFor(app, room);
	const completed = players.filter(
		(player) => player.getBool('completed') && player.getString('finished_at')
	);
	const endTime = Date.parse(room.getString('starts_at')) + RACE_SECONDS * 1000;
	if (now < endTime && completed.length < 3 && completed.length !== players.length) return null;
	completed.sort(
		(a, b) =>
			Date.parse(a.getString('finished_at')) - Date.parse(b.getString('finished_at')) ||
			a.id.localeCompare(b.id)
	);
	const podium = completed.slice(0, 3);
	const round = new Record(app.findCollectionByNameOrId('race_rounds'));
	round.set('room', room.id);
	round.set('number', room.getInt('round_number'));
	round.set('ended_at', new Date(now).toISOString());
	for (const [index, medal] of ['gold', 'silver', 'bronze'].entries()) {
		const player = podium[index];
		if (!player) continue;
		round.set(medal, player.id);
		player.set(`${medal}_count`, player.getInt(`${medal}_count`) + 1);
		player.set('points', player.getInt('points') + 3 - index);
		app.save(player);
	}
	app.save(round);
	room.set('round_finished_at', new Date(now).toISOString());
	app.save(room);
	return publicRound(round);
}

function sendRoom(room, kind, data) {
	const topic = 'typee_room_' + room.getString('code');
	const message = new SubscriptionMessage({
		name: topic,
		data: JSON.stringify({ kind: kind, ...data })
	});
	const clients = $app.subscriptionsBroker().clients();
	for (const id in clients) {
		if (clients[id].hasSubscription(topic)) clients[id].send(message);
	}
}

function verifyPlayer(e, room) {
	const id = e.request.header.get('X-Typee-Player');
	const token = e.request.header.get('X-Typee-Token');
	if (!/^[a-zA-Z0-9]{15}$/.test(id) || !/^[a-zA-Z0-9]{48}$/.test(token)) {
		throw new ForbiddenError('Sesi pemain tidak valid.');
	}
	let player;
	try {
		player = e.app.findRecordById('race_players', id);
	} catch {
		throw new ForbiddenError('Sesi pemain tidak valid.');
	}
	if (
		player.getString('room') !== room.id ||
		!$security.equal($security.sha256(token), player.getString('token_hash'))
	) {
		throw new ForbiddenError('Sesi pemain tidak valid.');
	}
	return player;
}

function makePlayer(app, room, nickname, isHost, avatarIndex, browserId) {
	const token = $security.randomString(48);
	const player = new Record(app.findCollectionByNameOrId('race_players'));
	player.set('room', room.id);
	player.set('nickname', nickname);
	player.set('avatar_index', avatarIndex);
	player.set('token_hash', $security.sha256(token));
	player.set('browser_hash', $security.sha256(browserId));
	player.set('is_host', isHost);
	app.save(player);
	return { player, token };
}

function correctPrefix(typed, passage) {
	let count = 0;
	while (count < typed.length && typed[count] === passage[count]) count++;
	return count;
}

module.exports = {
	RACE_SECONDS,
	MAX_PLAYERS,
	ROOM_LIFETIME_MS,
	PASSAGES,
	nicknameFrom,
	browserIdFrom,
	roomByCode,
	playersFor,
	publicPlayer,
	publicRound,
	publicChatMessage,
	snapshot,
	finalizeRound,
	sendRoom,
	verifyPlayer,
	makePlayer,
	correctPrefix
};
