import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';

const baseUrl = process.env.TYPEE_SMOKE_PB_URL;
if (!baseUrl) {
	throw new Error('Jalankan melalui bun run smoke:race agar memakai database uji sementara.');
}
const api = `${baseUrl}/api/typee`;

type Session = { player_id: string; token: string };
type Player = {
	id: string;
	nickname: string;
	avatar_index: number;
	completed: boolean;
	correct_chars: number;
	finished_at: string;
	points: number;
};
type State = {
	room: {
		id: string;
		code: string;
		passage: string;
		starts_at: string;
		status: string;
		round_number: number;
		round_finished_at: string;
		competition_ended: boolean;
	};
	players: Player[];
	session: Session;
};

function auth(session: Session) {
	return { 'X-Typee-Player': session.player_id, 'X-Typee-Token': session.token };
}

function browserId(number: number) {
	return number.toString(16).padStart(32, '0');
}

async function request<T>(
	path: string,
	method = 'GET',
	body?: unknown,
	headers: Record<string, string> = {}
) {
	const response = await fetch(`${api}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', ...headers },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const data = response.status === 204 ? null : await response.json();
	return { status: response.status, data: data as T };
}

async function main() {
	const created = await request<State>('/rooms', 'POST', {
		nickname: 'Host Test',
		browser_id: browserId(1)
	});
	assert.equal(created.status, 201, JSON.stringify(created.data));
	const { code, passage } = created.data.room;
	assert.equal(created.data.players.length, 1);
	assert.equal(created.data.players[0].avatar_index, 0);
	assert.equal((await request(`/rooms/${code}/chat`, 'POST', { text: 'Tanpa sesi' })).status, 403);
	assert.equal(
		(
			await request(
				`/rooms/${code}/chat`,
				'POST',
				{ text: 'x'.repeat(201) },
				auth(created.data.session)
			)
		).status,
		400
	);
	const chat = await request<{ message: { player_id: string; text: string } }>(
		`/rooms/${code}/chat`,
		'POST',
		{ text: 'Halo room' },
		auth(created.data.session)
	);
	assert.equal(chat.status, 201);
	assert.equal(chat.data.message.player_id, created.data.session.player_id);
	assert.equal(chat.data.message.text, 'Halo room');
	assert.equal((await request(`/rooms/${code}/chat`)).status, 403);
	const history = await request<{ messages: { text: string }[] }>(
		`/rooms/${code}/chat`,
		'GET',
		undefined,
		auth(created.data.session)
	);
	assert.equal(history.status, 200);
	assert.deepEqual(
		history.data.messages.map((message) => message.text),
		['Halo room']
	);
	for (let index = 0; index < 51; index++) {
		const response = await request(
			`/rooms/${code}/chat`,
			'POST',
			{ text: `Pesan ${index}` },
			auth(created.data.session)
		);
		assert.equal(response.status, 201, JSON.stringify(response.data));
	}
	const boundedHistory = await request<{ messages: { text: string }[] }>(
		`/rooms/${code}/chat`,
		'GET',
		undefined,
		auth(created.data.session)
	);
	assert.equal(boundedHistory.data.messages.length, 50);
	assert.equal(boundedHistory.data.messages[0].text, 'Pesan 1');
	assert.equal(boundedHistory.data.messages.at(-1)?.text, 'Pesan 50');
	const databasePath = process.env.TYPEE_SMOKE_DB_PATH;
	assert.ok(databasePath);
	const database = new Database(databasePath, { readonly: true });
	const savedCount = database
		.query('SELECT COUNT(*) AS total FROM race_messages WHERE room = ?')
		.get(created.data.room.id) as { total: number };
	assert.equal(savedCount.total, 50);
	const browserField = database
		.query('SELECT browser_hash FROM race_players WHERE id = ?')
		.get(created.data.session.player_id) as { browser_hash: string };
	assert.match(browserField.browser_hash, /^[a-f0-9]{64}$/);
	assert.notEqual(browserField.browser_hash, browserId(1));
	database.close();
	assert.equal((await request(`/rooms/${code}`)).status, 200);
	assert.equal((await request('/rooms/ABCDEFGH')).status, 404);
	assert.equal(
		(await request(`/rooms/${code}/start`, 'POST', undefined, auth(created.data.session))).status,
		400
	);

	assert.equal(
		(
			await request(`/rooms/${code}/join`, 'POST', {
				nickname: 'Host Kedua',
				browser_id: browserId(1)
			})
		).status,
		400
	);
	const joined = await request<State>(`/rooms/${code}/join`, 'POST', {
		nickname: 'Tamu Test',
		browser_id: browserId(2)
	});
	assert.equal(joined.status, 201, JSON.stringify(joined.data));
	assert.equal(joined.data.players.length, 2);
	assert.equal(
		joined.data.players.find((player) => player.nickname === 'Tamu Test')?.avatar_index,
		1
	);
	assert.equal(
		(
			await request(`/rooms/${code}/join`, 'POST', {
				nickname: 'Tamu Test',
				browser_id: browserId(3)
			})
		).status,
		400
	);
	for (let number = 3; number <= 10; number++) {
		assert.equal(
			(
				await request(`/rooms/${code}/join`, 'POST', {
					nickname: `Tamu ${number}`,
					browser_id: browserId(number)
				})
			).status,
			201
		);
	}
	assert.equal(
		(
			await request(`/rooms/${code}/join`, 'POST', {
				nickname: 'Tamu 11',
				browser_id: browserId(11)
			})
		).status,
		400
	);
	const tenPlayers = await request<State>(`/rooms/${code}`);
	assert.deepEqual(
		tenPlayers.data.players.map((player) => player.avatar_index).sort((a, b) => a - b),
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
	);
	assert.equal(
		(await request(`/rooms/${code}/start`, 'POST', undefined, auth(joined.data.session))).status,
		403
	);
	assert.equal(
		(
			await request(`/rooms/${code}/start`, 'POST', undefined, {
				...auth(created.data.session),
				'X-Typee-Token': 'x'.repeat(48)
			})
		).status,
		403
	);

	const started = await request<State>(
		`/rooms/${code}/start`,
		'POST',
		undefined,
		auth(created.data.session)
	);
	assert.equal(started.status, 200, JSON.stringify(started.data));
	assert.equal(started.data.room.status, 'running');
	assert.equal(
		(
			await request(`/rooms/${code}/join`, 'POST', {
				nickname: 'Late Guest',
				browser_id: browserId(11)
			})
		).status,
		400
	);
	assert.equal(
		(
			await request(
				`/rooms/${code}/finish`,
				'POST',
				{ typed: passage, starts_at: started.data.room.starts_at },
				auth(created.data.session)
			)
		).status,
		400
	);

	const waitMs = Math.max(0, Date.parse(started.data.room.starts_at) - Date.now() + 100);
	await new Promise((resolve) => setTimeout(resolve, waitMs));
	assert.equal(
		(
			await request(
				`/rooms/${code}/progress`,
				'POST',
				{ typed: passage.slice(0, 20), starts_at: started.data.room.starts_at },
				auth(created.data.session)
			)
		).status,
		204
	);
	const finished = await request<{ player: Player }>(
		`/rooms/${code}/finish`,
		'POST',
		{ typed: passage, starts_at: started.data.room.starts_at },
		auth(created.data.session)
	);
	assert.equal(finished.status, 200, JSON.stringify(finished.data));
	assert.equal(finished.data.player.completed, true);
	assert.equal(finished.data.player.correct_chars, passage.length);
	const duplicate = await request<{ player: Player }>(
		`/rooms/${code}/finish`,
		'POST',
		{ typed: '', starts_at: started.data.room.starts_at },
		auth(created.data.session)
	);
	assert.equal(duplicate.data.player.correct_chars, passage.length);
	const unfinished = await request<{ player: Player }>(
		`/rooms/${code}/finish`,
		'POST',
		{ typed: passage.slice(0, 20), starts_at: started.data.room.starts_at },
		auth(joined.data.session)
	);
	assert.equal(unfinished.data.player.completed, false);
	assert.equal(unfinished.data.player.correct_chars, 20);
	const snapshot = await request<State>(`/rooms/${code}`);
	assert.equal(snapshot.data.players.filter((player) => player.finished_at).length, 2);
	assert.equal(snapshot.data.room.round_finished_at, '');

	const rematchRoom = await request<State>('/rooms', 'POST', {
		nickname: 'Host Ulang',
		browser_id: browserId(1)
	});
	const rematchCode = rematchRoom.data.room.code;
	const rematchGuest = await request<State>(`/rooms/${rematchCode}/join`, 'POST', {
		nickname: 'Tamu Ulang',
		browser_id: browserId(2)
	});
	const firstRound = await request<State>(
		`/rooms/${rematchCode}/start`,
		'POST',
		undefined,
		auth(rematchRoom.data.session)
	);
	assert.equal(
		(
			await request(
				`/rooms/${rematchCode}/rematch`,
				'POST',
				undefined,
				auth(rematchRoom.data.session)
			)
		).status,
		400
	);
	await new Promise((resolve) =>
		setTimeout(resolve, Math.max(0, Date.parse(firstRound.data.room.starts_at) - Date.now() + 100))
	);
	for (const participant of [rematchRoom.data.session, rematchGuest.data.session]) {
		const finish = await request<{ player: Player }>(
			`/rooms/${rematchCode}/finish`,
			'POST',
			{ typed: firstRound.data.room.passage, starts_at: firstRound.data.room.starts_at },
			auth(participant)
		);
		assert.equal(finish.status, 200, JSON.stringify(finish.data));
	}
	assert.equal(
		(
			await request(
				`/rooms/${rematchCode}/rematch`,
				'POST',
				undefined,
				auth(rematchGuest.data.session)
			)
		).status,
		403
	);
	const reset = await request<State>(
		`/rooms/${rematchCode}/rematch`,
		'POST',
		undefined,
		auth(rematchRoom.data.session)
	);
	assert.equal(reset.status, 200, JSON.stringify(reset.data));
	assert.equal(reset.data.room.id, rematchRoom.data.room.id);
	assert.equal(reset.data.room.code, rematchCode);
	assert.equal(reset.data.room.status, 'waiting');
	assert.equal(reset.data.room.starts_at, '');
	assert.deepEqual(
		reset.data.players.map((player) => player.id),
		rematchGuest.data.players.map((player) => player.id)
	);
	assert.ok(
		reset.data.players.every(
			(player) => !player.finished_at && !player.completed && player.correct_chars === 0
		)
	);
	assert.equal(
		(
			await request(
				`/rooms/${rematchCode}/rematch`,
				'POST',
				undefined,
				auth(rematchRoom.data.session)
			)
		).status,
		400
	);
	const secondRound = await request<State>(
		`/rooms/${rematchCode}/start`,
		'POST',
		undefined,
		auth(rematchRoom.data.session)
	);
	assert.equal(secondRound.status, 200);
	assert.notEqual(secondRound.data.room.starts_at, firstRound.data.room.starts_at);
	await new Promise((resolve) =>
		setTimeout(resolve, Math.max(0, Date.parse(secondRound.data.room.starts_at) - Date.now() + 100))
	);
	assert.equal(
		(
			await request(
				`/rooms/${rematchCode}/finish`,
				'POST',
				{ typed: firstRound.data.room.passage, starts_at: firstRound.data.room.starts_at },
				auth(rematchRoom.data.session)
			)
		).status,
		400
	);
	assert.equal(
		(
			await request(
				`/rooms/${rematchCode}/finish`,
				'POST',
				{ typed: secondRound.data.room.passage, starts_at: secondRound.data.room.starts_at },
				auth(rematchRoom.data.session)
			)
		).status,
		200
	);
	const concurrentRoom = await request<State>('/rooms', 'POST', {
		nickname: 'Host Paralel',
		browser_id: browserId(1)
	});
	const concurrentCode = concurrentRoom.data.room.code;
	const concurrentJoins = await Promise.all(
		['Tamu Paralel A', 'Tamu Paralel B'].map((nickname) =>
			request(`/rooms/${concurrentCode}/join`, 'POST', {
				nickname,
				browser_id: browserId(12)
			})
		)
	);
	assert.deepEqual(concurrentJoins.map((response) => response.status).sort(), [201, 400]);
	assert.equal((await request<State>(`/rooms/${concurrentCode}`)).data.players.length, 2);

	const tournament = await request<State>('/rooms', 'POST', {
		nickname: 'Host Turnamen',
		browser_id: browserId(1)
	});
	assert.equal(tournament.status, 201);
	const tournamentCode = tournament.data.room.code;
	const tournamentGuests: State[] = [];
	for (let number = 2; number <= 4; number++) {
		const joined = await request<State>(`/rooms/${tournamentCode}/join`, 'POST', {
			nickname: `Pemain Turnamen ${number}`,
			browser_id: browserId(number)
		});
		assert.equal(joined.status, 201);
		tournamentGuests.push(joined.data);
	}
	const firstTournamentRound = await request<State>(
		`/rooms/${tournamentCode}/start`,
		'POST',
		undefined,
		auth(tournament.data.session)
	);
	assert.equal(firstTournamentRound.data.room.round_number, 1);
	await new Promise((resolve) =>
		setTimeout(
			resolve,
			Math.max(0, Date.parse(firstTournamentRound.data.room.starts_at) - Date.now() + 100)
		)
	);
	for (const session of [
		tournamentGuests[0].session,
		tournament.data.session,
		tournamentGuests[1].session
	]) {
		const finish = await request<{ state: State }>(
			`/rooms/${tournamentCode}/finish`,
			'POST',
			{
				typed: firstTournamentRound.data.room.passage,
				starts_at: firstTournamentRound.data.room.starts_at
			},
			auth(session)
		);
		assert.equal(finish.status, 200);
	}
	const earlyResult = await request<State>(`/rooms/${tournamentCode}`);
	assert.ok(earlyResult.data.room.round_finished_at);
	assert.equal(earlyResult.data.players.filter((player) => player.finished_at).length, 3);
	const firstPodium = await request<{
		rounds: { gold: string; silver: string; bronze: string; number: number }[];
	}>(`/rooms/${tournamentCode}/rounds/0`);
	assert.equal(firstPodium.data.rounds.length, 1);
	assert.deepEqual(firstPodium.data.rounds[0], {
		...firstPodium.data.rounds[0],
		gold: tournamentGuests[0].session.player_id,
		silver: tournament.data.session.player_id,
		bronze: tournamentGuests[1].session.player_id,
		number: 1
	});
	assert.equal(
		(
			await request(
				`/rooms/${tournamentCode}/finish`,
				'POST',
				{
					typed: firstTournamentRound.data.room.passage,
					starts_at: firstTournamentRound.data.room.starts_at
				},
				auth(tournamentGuests[1].session)
			)
		).status,
		200
	);
	assert.equal(
		(await request<State>(`/rooms/${tournamentCode}`)).data.players.find(
			(player) => player.id === tournamentGuests[1].session.player_id
		)?.points,
		1
	);
	assert.equal(
		(
			await request(
				`/rooms/${tournamentCode}/complete`,
				'POST',
				undefined,
				auth(tournamentGuests[0].session)
			)
		).status,
		403
	);
	const tournamentRematch = await request<State>(
		`/rooms/${tournamentCode}/rematch`,
		'POST',
		undefined,
		auth(tournament.data.session)
	);
	assert.equal(tournamentRematch.status, 200);
	assert.equal(tournamentRematch.data.room.code, tournamentCode);
	assert.equal(
		tournamentRematch.data.players.find((player) => player.id === tournament.data.session.player_id)
			?.points,
		2
	);
	const secondTournamentRound = await request<State>(
		`/rooms/${tournamentCode}/start`,
		'POST',
		undefined,
		auth(tournament.data.session)
	);
	assert.equal(secondTournamentRound.data.room.round_number, 2);
	await new Promise((resolve) =>
		setTimeout(
			resolve,
			Math.max(0, Date.parse(secondTournamentRound.data.room.starts_at) - Date.now() + 100)
		)
	);
	for (const session of [
		tournament.data.session,
		tournamentGuests[1].session,
		tournamentGuests[2].session
	]) {
		const finish = await request(
			`/rooms/${tournamentCode}/finish`,
			'POST',
			{
				typed: secondTournamentRound.data.room.passage,
				starts_at: secondTournamentRound.data.room.starts_at
			},
			auth(session)
		);
		assert.equal(finish.status, 200);
	}
	const finalTournament = await request<State>(`/rooms/${tournamentCode}`);
	assert.equal(
		finalTournament.data.players.find((player) => player.id === tournament.data.session.player_id)
			?.points,
		5
	);
	assert.deepEqual(
		finalTournament.data.players.map((player) => player.points).sort((a, b) => b - a),
		[5, 3, 3, 1]
	);
	const tournamentHistory = await request<{ rounds: { number: number }[] }>(
		`/rooms/${tournamentCode}/rounds/0`
	);
	assert.deepEqual(
		tournamentHistory.data.rounds.map((round) => round.number),
		[2, 1]
	);
	assert.equal((await request(`/rooms/${tournamentCode}/rounds/nope`)).status, 400);
	const completedTournament = await request<State>(
		`/rooms/${tournamentCode}/complete`,
		'POST',
		undefined,
		auth(tournament.data.session)
	);
	assert.equal(completedTournament.status, 200);
	assert.equal(completedTournament.data.room.competition_ended, true);
	assert.equal(
		(
			await request(
				`/rooms/${tournamentCode}/rematch`,
				'POST',
				undefined,
				auth(tournament.data.session)
			)
		).status,
		400
	);

	const timeoutRoom = await request<State>('/rooms', 'POST', {
		nickname: 'Host Batas Waktu',
		browser_id: browserId(1)
	});
	assert.equal(timeoutRoom.status, 201, JSON.stringify(timeoutRoom.data));
	const timeoutCode = timeoutRoom.data.room.code;
	assert.equal(
		(
			await request(`/rooms/${timeoutCode}/join`, 'POST', {
				nickname: 'Tamu Batas Waktu',
				browser_id: browserId(2)
			})
		).status,
		201
	);
	assert.equal(
		(
			await request(
				`/rooms/${timeoutCode}/start`,
				'POST',
				undefined,
				auth(timeoutRoom.data.session)
			)
		).status,
		200
	);
	const testDatabase = new Database(databasePath);
	testDatabase
		.query('UPDATE rooms SET starts_at = ? WHERE id = ?')
		.run(new Date(Date.now() - 61_000).toISOString(), timeoutRoom.data.room.id);
	testDatabase.close();
	const timedOut = await request<State>(`/rooms/${timeoutCode}`);
	assert.ok(timedOut.data.room.round_finished_at);
	assert.ok(timedOut.data.players.every((player) => player.points === 0));
	console.log(
		`Smoke race lulus: room ${code}, otorisasi, hasil, dan rematch ${rematchCode} dengan kode sama.`
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
