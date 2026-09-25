// Each PocketBase handler runs in an isolated JS context, so shared code is loaded inside it.
routerAdd(
	'POST',
	'/api/typee/rooms',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const body = new DynamicModel({ nickname: '', browser_id: '' });
		e.bindBody(body);
		const nickname = race.nicknameFrom(body);
		const browserId = race.browserIdFrom(body);
		let room;
		let guest;
		e.app.runInTransaction((tx) => {
			room = new Record(tx.findCollectionByNameOrId('rooms'));
			room.set('code', $security.randomStringWithAlphabet(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'));
			room.set('passage', race.PASSAGES[Math.floor(Math.random() * race.PASSAGES.length)]);
			room.set('status', 'waiting');
			room.set('duration_seconds', race.RACE_SECONDS);
			room.set('expires_at', new Date(Date.now() + race.ROOM_LIFETIME_MS).toISOString());
			tx.save(room);
			guest = race.makePlayer(tx, room, nickname, true, 0, browserId);
		});
		return e.json(201, {
			...race.snapshot(e.app, room),
			session: { player_id: guest.player.id, token: guest.token }
		});
	},
	$apis.bodyLimit(2048)
);

routerAdd('GET', '/api/typee/rooms/{code}', (e) => {
	const race = require(`${__hooks}/typee_shared.js`);
	const code = e.request.pathValue('code');
	let room = race.roomByCode(e.app, code);
	let round = null;
	if (
		room.getString('status') === 'running' &&
		!room.getString('round_finished_at') &&
		Date.now() >= Date.parse(room.getString('starts_at')) + race.RACE_SECONDS * 1000
	) {
		e.app.runInTransaction((tx) => {
			room = race.roomByCode(tx, code);
			round = race.finalizeRound(tx, room, Date.now());
		});
	}
	if (round) race.sendRoom(room, 'round_finished', { ...race.snapshot(e.app, room), round });
	return e.json(200, race.snapshot(e.app, room));
});

routerAdd('GET', '/api/typee/rooms/{code}/rounds/{offset}', (e) => {
	const race = require(`${__hooks}/typee_shared.js`);
	const room = race.roomByCode(e.app, e.request.pathValue('code'));
	const rawOffset = e.request.pathValue('offset');
	if (!/^(0|[1-9][0-9]{0,5})$/.test(rawOffset)) throw new BadRequestError('Offset tidak valid.');
	const rounds = e.app.findRecordsByFilter(
		'race_rounds',
		'room = {:room}',
		'-number',
		21,
		Number(rawOffset),
		{ room: room.id }
	);
	return e.json(200, {
		rounds: rounds.slice(0, 20).map(race.publicRound),
		has_more: rounds.length > 20
	});
});

routerAdd('GET', '/api/typee/rooms/{code}/chat', (e) => {
	const race = require(`${__hooks}/typee_shared.js`);
	const room = race.roomByCode(e.app, e.request.pathValue('code'));
	race.verifyPlayer(e, room);
	const messages = e.app.findRecordsByFilter(
		'race_messages',
		'room = {:room}',
		'-sequence',
		50,
		0,
		{ room: room.id }
	);
	return e.json(200, { messages: [...messages].reverse().map(race.publicChatMessage) });
});

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/chat',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const room = race.roomByCode(e.app, e.request.pathValue('code'));
		const player = race.verifyPlayer(e, room);
		const body = new DynamicModel({ text: '' });
		e.bindBody(body);
		const text = String(body.text || '')
			.trim()
			.replace(/\s+/g, ' ');
		if (!text || text.length > 200) throw new BadRequestError('Pesan harus 1–200 karakter.');
		let message;
		e.app.runInTransaction((tx) => {
			const latest = tx.findRecordsByFilter('race_messages', 'room = {:room}', '-sequence', 1, 0, {
				room: room.id
			});
			const record = new Record(tx.findCollectionByNameOrId('race_messages'));
			record.set('room', room.id);
			record.set('player', player.id);
			record.set('nickname', player.getString('nickname'));
			record.set('text', text);
			record.set('sequence', (latest[0]?.getInt('sequence') ?? 0) + 1);
			tx.save(record);
			const stale = tx.findRecordsByFilter(
				'race_messages',
				'room = {:room}',
				'-sequence',
				100,
				50,
				{ room: room.id }
			);
			for (const old of stale) tx.delete(old);
			message = race.publicChatMessage(record);
		});
		race.sendRoom(room, 'chat', { message });
		return e.json(201, { message });
	},
	$apis.bodyLimit(512)
);

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/join',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const code = e.request.pathValue('code');
		const body = new DynamicModel({ nickname: '', browser_id: '' });
		e.bindBody(body);
		const nickname = race.nicknameFrom(body);
		const browserId = race.browserIdFrom(body);
		const browserHash = $security.sha256(browserId);
		let room;
		let guest;
		e.app.runInTransaction((tx) => {
			room = race.roomByCode(tx, code);
			const players = race.playersFor(tx, room);
			if (room.getString('status') !== 'waiting') throw new BadRequestError('Race sudah dimulai.');
			if (players.some((player) => player.getString('browser_hash') === browserHash)) {
				throw new BadRequestError('Browser ini sudah memiliki pemain di room ini.');
			}
			if (players.length >= race.MAX_PLAYERS) throw new BadRequestError('Room sudah penuh.');
			if (
				players.some(
					(player) => player.getString('nickname').toLowerCase() === nickname.toLowerCase()
				)
			) {
				throw new BadRequestError('Nama sudah dipakai di room ini.');
			}
			guest = race.makePlayer(tx, room, nickname, false, players.length, browserId);
		});
		const state = race.snapshot(e.app, room);
		race.sendRoom(room, 'player_joined', { player: race.publicPlayer(guest.player) });
		return e.json(201, { ...state, session: { player_id: guest.player.id, token: guest.token } });
	},
	$apis.bodyLimit(2048)
);

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/start',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const code = e.request.pathValue('code');
		let room;
		e.app.runInTransaction((tx) => {
			room = race.roomByCode(tx, code);
			const player = race.verifyPlayer({ app: tx, request: e.request }, room);
			if (!player.getBool('is_host'))
				throw new ForbiddenError('Hanya host yang dapat memulai race.');
			if (room.getBool('competition_ended'))
				throw new BadRequestError('Pertandingan sudah diakhiri.');
			if (room.getString('status') !== 'waiting') throw new BadRequestError('Race sudah dimulai.');
			if (race.playersFor(tx, room).length < 2)
				throw new BadRequestError('Minimal dua pemain diperlukan.');
			room.set('status', 'running');
			room.set('round_number', room.getInt('round_number') + 1);
			room.set('round_finished_at', '');
			room.set('starts_at', new Date(Date.now() + 3000).toISOString());
			tx.save(room);
		});
		const state = race.snapshot(e.app, room);
		race.sendRoom(room, 'started', { room: state.room });
		return e.json(200, state);
	},
	$apis.bodyLimit(2048)
);

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/rematch',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const code = e.request.pathValue('code');
		let room;
		let finalizedRound = null;
		e.app.runInTransaction((tx) => {
			room = race.roomByCode(tx, code);
			const host = race.verifyPlayer({ app: tx, request: e.request }, room);
			if (!host.getBool('is_host'))
				throw new ForbiddenError('Hanya host yang dapat memulai ronde baru.');
			if (room.getBool('competition_ended'))
				throw new BadRequestError('Pertandingan sudah diakhiri.');
			if (room.getString('status') !== 'running') throw new BadRequestError('Race belum dimulai.');
			const players = race.playersFor(tx, room);
			finalizedRound = race.finalizeRound(tx, room, Date.now());
			if (!room.getString('round_finished_at'))
				throw new BadRequestError('Tunggu tiga pemain selesai atau waktu habis.');
			room.set('status', 'waiting');
			room.set('starts_at', '');
			room.set('passage', race.PASSAGES[Math.floor(Math.random() * race.PASSAGES.length)]);
			room.set('expires_at', new Date(Date.now() + race.ROOM_LIFETIME_MS).toISOString());
			tx.save(room);
			for (const player of players) {
				player.set('finished_at', '');
				player.set('correct_chars', 0);
				player.set('elapsed_ms', 0);
				player.set('wpm', 0);
				player.set('completed', false);
				tx.save(player);
			}
		});
		const state = race.snapshot(e.app, room);
		if (finalizedRound) race.sendRoom(room, 'round_finished', { ...state, round: finalizedRound });
		race.sendRoom(room, 'rematch', state);
		return e.json(200, state);
	},
	$apis.bodyLimit(2048)
);

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/complete',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		let room;
		e.app.runInTransaction((tx) => {
			room = race.roomByCode(tx, e.request.pathValue('code'));
			const host = race.verifyPlayer({ app: tx, request: e.request }, room);
			if (!host.getBool('is_host')) throw new ForbiddenError('Hanya host yang dapat mengakhiri.');
			if (room.getBool('competition_ended')) return;
			if (room.getString('status') !== 'running' || !room.getString('round_finished_at')) {
				throw new BadRequestError('Selesaikan ronde saat ini terlebih dahulu.');
			}
			room.set('competition_ended', true);
			tx.save(room);
		});
		const state = race.snapshot(e.app, room);
		race.sendRoom(room, 'competition_ended', state);
		return e.json(200, state);
	},
	$apis.bodyLimit(2048)
);

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/progress',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const room = race.roomByCode(e.app, e.request.pathValue('code'));
		const player = race.verifyPlayer(e, room);
		if (
			room.getString('status') !== 'running' ||
			room.getString('round_finished_at') ||
			player.getString('finished_at')
		)
			return e.noContent(204);
		const start = Date.parse(room.getString('starts_at'));
		const now = Date.now();
		if (now < start || now > start + race.RACE_SECONDS * 1000) return e.noContent(204);
		const body = new DynamicModel({ typed: '', starts_at: '' });
		e.bindBody(body);
		if (body.starts_at !== room.getString('starts_at'))
			throw new BadRequestError('Ronde sudah berubah.');
		const typed = String(body.typed || '');
		const passage = room.getString('passage');
		if (typed.length > passage.length + 20) throw new BadRequestError('Input terlalu panjang.');
		const correct = Math.min(
			race.correctPrefix(typed, passage),
			typed === passage ? passage.length : passage.length - 1
		);
		race.sendRoom(room, 'progress', {
			player_id: player.id,
			correct_chars: correct,
			wpm: Math.round(correct / 5 / ((now - start) / 60000))
		});
		return e.noContent(204);
	},
	$apis.bodyLimit(2048)
);

routerAdd(
	'POST',
	'/api/typee/rooms/{code}/finish',
	(e) => {
		const race = require(`${__hooks}/typee_shared.js`);
		const body = new DynamicModel({ typed: '', starts_at: '' });
		e.bindBody(body);
		let room;
		let result;
		let round = null;
		let newlyFinished = false;
		e.app.runInTransaction((tx) => {
			room = race.roomByCode(tx, e.request.pathValue('code'));
			const player = race.verifyPlayer({ app: tx, request: e.request }, room);
			if (room.getString('status') !== 'running') throw new BadRequestError('Race belum dimulai.');
			if (body.starts_at !== room.getString('starts_at'))
				throw new BadRequestError('Ronde sudah berubah.');
			const start = Date.parse(room.getString('starts_at'));
			const now = Date.now();
			if (now < start) throw new BadRequestError('Hitung mundur belum selesai.');
			if (!player.getString('finished_at') && !room.getString('round_finished_at')) {
				const typed = String(body.typed || '');
				const passage = room.getString('passage');
				if (typed.length > passage.length + 20) throw new BadRequestError('Input terlalu panjang.');
				const elapsed = Math.min(Math.max(now - start, 1000), race.RACE_SECONDS * 1000);
				const correct = Math.min(
					race.correctPrefix(typed, passage),
					typed === passage ? passage.length : passage.length - 1
				);
				player.set('finished_at', new Date(now).toISOString());
				player.set('correct_chars', correct);
				player.set('elapsed_ms', elapsed);
				player.set('wpm', Math.round(correct / 5 / (elapsed / 60000)));
				player.set('completed', typed === passage && now <= start + race.RACE_SECONDS * 1000);
				tx.save(player);
				newlyFinished = true;
			}
			result = race.publicPlayer(player);
			round = race.finalizeRound(tx, room, now);
		});
		const state = race.snapshot(e.app, room);
		if (newlyFinished) race.sendRoom(room, 'finished', { player: result });
		if (round) race.sendRoom(room, 'round_finished', { ...state, round });
		return e.json(200, { player: result, state });
	},
	$apis.bodyLimit(2048)
);

cronAdd('typee_expired_rooms', '*/15 * * * *', () => {
	const expired = $app.findRecordsByFilter('rooms', 'expires_at < {:now}', '', 200, 0, {
		now: new Date().toISOString()
	});
	for (const room of expired) $app.delete(room);
});
