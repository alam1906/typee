<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { correctPrefix, wordsPerMinute } from '../../../lib/game/metrics.js';
	import { roomAvatars, segmentPassage } from '../../../lib/race/markers.js';
	import {
		clearSession,
		loadSession,
		raceApi,
		raceRealtime,
		saveSession,
		type RaceEvent,
		type RaceChatMessage,
		type RacePlayer,
		type RaceRound,
		type RaceRoom,
		type RaceSession,
		type RaceSnapshot
	} from '../../../lib/race/api.js';

	let code = $derived(page.params.code?.toUpperCase() ?? '');
	let room = $state<RaceRoom | null>(null);
	let players = $state<RacePlayer[]>([]);
	let emptySlots = $derived(
		Array.from(
			{ length: Math.max(0, roomAvatars.length - players.length) },
			(_, index) => players.length + index
		)
	);
	let session = $state<RaceSession | null>(null);
	let nickname = $state('');
	let typed = $state('');
	let activeWordIndex = $state(0);
	const maxExtraLetters = 20;
	let progressByPlayer = $state<Record<string, { correct: number; wpm: number }>>({});
	let clockOffset = $state(0);
	let now = $state(Date.now());
	let loading = $state(true);
	let busy = $state(false);
	let finishing = $state(false);
	let errorMessage = $state('');
	let copied = $state(false);
	let shareUrl = $state('');
	let chatMessages = $state<RaceChatMessage[]>([]);
	let chatDraft = $state('');
	let chatBusy = $state(false);
	let chatLoading = $state(false);
	let chatError = $state('');
	let rounds = $state<RaceRound[]>([]);
	let hasMoreRounds = $state(false);
	let loadingRounds = $state(false);
	let roundsError = $state('');
	let raceInput = $state<HTMLTextAreaElement>();
	let raceFocusScheduled = false;
	let progressTimer: number | undefined;
	let lastSent = '';
	let nextFinishAttemptAt = 0;

	let self = $derived(players.find((player) => player.id === session?.player_id));
	let startTime = $derived(room?.starts_at ? Date.parse(room.starts_at) : 0);
	let endTime = $derived(startTime + (room?.duration_seconds ?? 60) * 1000);
	let everyoneFinished = $derived(
		players.length >= 2 && players.every((player) => player.completed)
	);
	let standings = $derived(
		[...players].sort(
			(a, b) =>
				b.points - a.points ||
				b.gold_count - a.gold_count ||
				b.silver_count - a.silver_count ||
				a.avatar_index - b.avatar_index
		)
	);
	let leaders = $derived(
		standings.length && standings[0].points > 0
			? standings.filter((player) => player.points === standings[0].points)
			: []
	);
	let currentPodium = $derived(rounds.find((item) => item.number === room?.round_number));
	let phase = $derived.by(() => {
		if (!room) return 'loading';
		if (room.status === 'waiting') return 'waiting';
		if (now < startTime) return 'countdown';
		if (room.round_finished_at || now >= endTime || everyoneFinished) return 'results';
		return 'racing';
	});
	let timeLeft = $derived(Math.max(1, Math.ceil((startTime - now) / 1000)));
	let raceSecondsLeft = $derived(
		phase === 'racing' ? Math.max(0, Math.ceil((endTime - now) / 1000)) : 0
	);
	let ownCorrect = $derived(
		room
			? Math.min(
					correctPrefix(typed, room.passage),
					typed === room.passage ? room.passage.length : room.passage.length - 1
				)
			: 0
	);
	let passageSegments = $derived(room ? segmentPassage(room.passage) : []);
	let wordSegments = $derived(passageSegments.filter((segment) => segment.isWord));
	let activeWord = $derived(wordSegments[activeWordIndex]);
	let currentWordInput = $derived(activeWord ? typed.slice(activeWord.start) : '');
	let currentWordHasError = $derived(
		activeWord
			? Array.from(currentWordInput).some((char, index) => char !== activeWord.text[index])
			: false
	);
	function avatarFor(player: RacePlayer) {
		return roomAvatars[player.avatar_index] ?? roomAvatars[0];
	}

	function laneProgress(player: RacePlayer) {
		if (!room) return 0;
		const correct =
			player.id === session?.player_id
				? player.completed
					? room.passage.length
					: ownCorrect
				: (progressByPlayer[player.id]?.correct ?? player.correct_chars);
		return Math.min(100, Math.round((correct / room.passage.length) * 100));
	}

	function laneWpm(player: RacePlayer) {
		if (player.finished_at) return player.wpm;
		if (player.id === session?.player_id)
			return wordsPerMinute(ownCorrect, Math.max(0, now - startTime));
		return progressByPlayer[player.id]?.wpm ?? 0;
	}

	function medalFor(playerId: string, round = currentPodium) {
		if (!round) return '';
		if (round.gold === playerId) return '🥇 +3';
		if (round.silver === playerId) return '🥈 +2';
		if (round.bronze === playerId) return '🥉 +1';
		return '';
	}

	function playerName(playerId: string) {
		return players.find((player) => player.id === playerId)?.nickname ?? 'Pemain';
	}

	function raceClock(seconds: number) {
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	}

	$effect(() => {
		if (phase !== 'racing' || !session || self?.finished_at || raceFocusScheduled) return;
		raceFocusScheduled = true;
		const frame = window.requestAnimationFrame(() => raceInput?.focus({ preventScroll: true }));
		return () => window.cancelAnimationFrame(frame);
	});

	function setRoom(nextRoom: RaceRoom) {
		if (room && room.starts_at !== nextRoom.starts_at) {
			typed = '';
			activeWordIndex = 0;
			progressByPlayer = {};
			lastSent = '';
			nextFinishAttemptAt = 0;
			raceFocusScheduled = false;
			if (progressTimer) window.clearTimeout(progressTimer);
			progressTimer = undefined;
		}
		room = nextRoom;
	}

	function applySnapshot(state: RaceSnapshot) {
		setRoom(state.room);
		players = [...state.players].sort((a, b) => a.avatar_index - b.avatar_index);
		if (session && !state.players.some((player) => player.id === session?.player_id)) {
			session = null;
			clearSession(code);
		}
		clockOffset = Date.parse(state.server_time) - Date.now();
		now = Date.now() + clockOffset;
	}

	function applyEvent(event: RaceEvent) {
		if (event.kind === 'chat' && event.message) addChatMessage(event.message);
		if (event.kind === 'player_joined' && event.player) {
			if (!players.some((player) => player.id === event.player?.id))
				players = [...players, event.player].sort((a, b) => a.avatar_index - b.avatar_index);
		}
		if (event.kind === 'started' && event.room) setRoom(event.room);
		if (event.kind === 'rematch' && event.room && event.players && event.server_time) {
			applySnapshot({ room: event.room, players: event.players, server_time: event.server_time });
			void loadRounds(true);
		}
		if (
			(event.kind === 'round_finished' || event.kind === 'competition_ended') &&
			event.room &&
			event.players &&
			event.server_time
		) {
			applySnapshot({ room: event.room, players: event.players, server_time: event.server_time });
			void loadRounds(true);
		}
		if (event.kind === 'progress' && event.player_id) {
			progressByPlayer = {
				...progressByPlayer,
				[event.player_id]: {
					correct: event.correct_chars ?? 0,
					wpm: event.wpm ?? 0
				}
			};
		}
		if (event.kind === 'finished' && event.player) {
			players = players.map((player) => (player.id === event.player?.id ? event.player : player));
		}
	}

	function addChatMessage(message: RaceChatMessage) {
		if (chatMessages.some((item) => item.id === message.id)) return;
		chatMessages = [...chatMessages, message].slice(-50);
	}

	async function loadRounds(reset = false) {
		if (loadingRounds && !reset) return;
		loadingRounds = true;
		try {
			const offset = reset ? 0 : rounds.length;
			const result = await raceApi.rounds(code, offset);
			rounds = reset
				? result.rounds
				: [...rounds, ...result.rounds.filter((item) => !rounds.some((old) => old.id === item.id))];
			hasMoreRounds = result.has_more;
			roundsError = '';
		} catch (error) {
			roundsError = error instanceof Error ? error.message : 'Riwayat ronde gagal dimuat.';
		} finally {
			loadingRounds = false;
		}
	}

	async function loadChat(currentSession: RaceSession) {
		chatLoading = true;
		try {
			const { messages } = await raceApi.chatHistory(code, currentSession);
			if (session?.player_id !== currentSession.player_id) return;
			const historicalIds = new Set(messages.map((message) => message.id));
			chatMessages = [
				...messages,
				...chatMessages.filter((message) => !historicalIds.has(message.id))
			].slice(-50);
			chatError = '';
		} catch (error) {
			chatError = error instanceof Error ? error.message : 'Riwayat chat gagal dimuat.';
		} finally {
			chatLoading = false;
		}
	}

	async function sendChat() {
		const text = chatDraft.trim();
		if (!session || !text || chatBusy) return;
		chatBusy = true;
		chatError = '';
		try {
			const result = await raceApi.chat(code, session, text);
			addChatMessage(result.message);
			chatDraft = '';
		} catch (error) {
			chatError = error instanceof Error ? error.message : 'Pesan gagal dikirim.';
		} finally {
			chatBusy = false;
		}
	}

	async function refresh() {
		try {
			applySnapshot(await raceApi.get(code));
			void loadRounds(true);
			errorMessage = '';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Room tidak dapat dimuat.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		shareUrl = window.location.href;
		session = loadSession(code);
		void refresh();
		if (session) void loadChat(session);
		let disposed = false;
		const ticker = window.setInterval(() => {
			now = Date.now() + clockOffset;
			if (
				room &&
				phase === 'results' &&
				!room.round_finished_at &&
				session &&
				!self?.finished_at &&
				!finishing &&
				Date.now() >= nextFinishAttemptAt
			)
				void finishRace();
		}, 100);
		const refreshWhenVisible = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		const refreshWhenOnline = () => {
			void refresh();
		};
		document.addEventListener('visibilitychange', refreshWhenVisible);
		window.addEventListener('online', refreshWhenOnline);
		window.addEventListener('keydown', handleRaceKeydown);
		const realtime = raceRealtime();
		void realtime.realtime
			.subscribe(`typee_room_${code}`, (message: RaceEvent) => {
				if (message?.kind) applyEvent(message);
			})
			.then(() => {
				if (disposed) void realtime.realtime.unsubscribe(`typee_room_${code}`);
				else void refresh();
			})
			.catch(() => {
				if (!disposed) void refresh();
			});
		return () => {
			disposed = true;
			window.clearInterval(ticker);
			document.removeEventListener('visibilitychange', refreshWhenVisible);
			window.removeEventListener('online', refreshWhenOnline);
			window.removeEventListener('keydown', handleRaceKeydown);
			if (progressTimer) window.clearTimeout(progressTimer);
			void realtime.realtime.unsubscribe(`typee_room_${code}`);
		};
	});

	async function joinRoom() {
		if (busy) return;
		const existing = loadSession(code);
		if (existing) {
			session = existing;
			void refresh();
			void loadChat(existing);
			return;
		}
		busy = true;
		errorMessage = '';
		try {
			const state = await raceApi.join(code, nickname);
			saveSession(code, state.session);
			session = state.session;
			applySnapshot(state);
			void loadChat(state.session);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Tidak dapat bergabung.';
		} finally {
			busy = false;
		}
	}

	async function startRace() {
		if (!session || busy) return;
		busy = true;
		errorMessage = '';
		try {
			applySnapshot(await raceApi.start(code, session));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Race tidak dapat dimulai.';
		} finally {
			busy = false;
		}
	}

	async function startRematch() {
		if (!session || busy || phase !== 'results' || !self?.is_host) return;
		busy = true;
		errorMessage = '';
		try {
			applySnapshot(await raceApi.rematch(code, session));
			void loadRounds(true);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Ronde baru tidak dapat dimulai.';
		} finally {
			busy = false;
		}
	}

	async function completeCompetition() {
		if (!session || busy || !self?.is_host || !room?.round_finished_at) return;
		busy = true;
		errorMessage = '';
		try {
			applySnapshot(await raceApi.complete(code, session));
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Pertandingan gagal diakhiri.';
		} finally {
			busy = false;
		}
	}

	function sendProgressSoon() {
		if (progressTimer || !session) return;
		progressTimer = window.setTimeout(() => {
			progressTimer = undefined;
			if (!session || !room || phase !== 'racing' || typed === lastSent) return;
			lastSent = typed;
			void raceApi.progress(code, session, typed, room.starts_at).catch(() => {
				/* finish request remains authoritative */
			});
		}, 2000);
	}

	function onRaceInput(event: Event) {
		applyRaceTyping((event.currentTarget as HTMLTextAreaElement).value);
	}

	function handleRaceKeydown(event: KeyboardEvent) {
		if (
			phase !== 'racing' ||
			!session ||
			self?.finished_at ||
			event.defaultPrevented ||
			event.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey ||
			event.target instanceof HTMLInputElement ||
			event.target instanceof HTMLTextAreaElement ||
			(event.target instanceof HTMLElement &&
				(event.target.isContentEditable || event.target.closest('a, button, [role="button"]')))
		)
			return;
		if (event.key === 'Backspace') {
			event.preventDefault();
			applyRaceTyping(typed.slice(0, -1));
		} else if (event.key.length === 1) {
			event.preventDefault();
			applyRaceTyping(typed + event.key);
		} else {
			return;
		}
		raceInput?.focus({ preventScroll: true });
	}

	function applyRaceTyping(value: string) {
		if (!room || phase !== 'racing' || !session || self?.finished_at) return;
		const next = value.slice(0, room.passage.length + maxExtraLetters);
		const previous = typed;
		if (next.length < typed.length && typed.startsWith(next)) {
			typed = next;
			while (activeWordIndex > 0 && typed.length < wordSegments[activeWordIndex].start) {
				activeWordIndex -= 1;
			}
		} else if (next.startsWith(typed) && next.length > typed.length) {
			for (const char of next.slice(typed.length)) {
				const word = wordSegments[activeWordIndex];
				if (!word) break;
				const current = typed.slice(word.start);
				if (/\s/.test(char)) {
					const nextWord = wordSegments[activeWordIndex + 1];
					if (
						!nextWord ||
						current !== word.text ||
						room.passage.slice(word.end, nextWord.start) !== char
					)
						break;
					typed += char;
					activeWordIndex += 1;
				} else {
					if (current.length >= word.text.length + maxExtraLetters) break;
					typed += char;
				}
			}
		} else if (activeWord) {
			const confirmedPrefix = room.passage.slice(0, activeWord.start);
			const revisedWord = next.slice(activeWord.start);
			if (
				next.startsWith(confirmedPrefix) &&
				!/[\s]/.test(revisedWord) &&
				revisedWord.length <= activeWord.text.length + maxExtraLetters
			) {
				typed = next;
			}
		}
		if (typed !== previous) {
			if (typed === room.passage) void finishRace();
			else sendProgressSoon();
		}
		if (raceInput) {
			raceInput.value = typed;
			raceInput.setSelectionRange(typed.length, typed.length);
		}
	}

	async function finishRace() {
		if (!session || !room || finishing || self?.finished_at) return;
		const startsAt = room.starts_at;
		finishing = true;
		if (progressTimer) {
			window.clearTimeout(progressTimer);
			progressTimer = undefined;
		}
		try {
			const result = await raceApi.finish(code, session, typed, startsAt);
			if (room?.starts_at !== startsAt) return;
			applySnapshot(result.state);
			if (result.state.room.round_finished_at) void loadRounds(true);
		} catch (error) {
			if (room?.starts_at !== startsAt) return;
			errorMessage = error instanceof Error ? error.message : 'Hasil belum tersimpan. Coba lagi.';
			nextFinishAttemptAt = Date.now() + 3000;
		} finally {
			finishing = false;
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			errorMessage = 'Tidak dapat menyalin tautan. Salin alamat halaman ini secara manual.';
		}
	}
</script>

<svelte:head>
	<title>Room {code} — Typee</title>
	<meta name="description" content="Typing race bersama teman di Typee." />
</svelte:head>

<div class="race-room-shell">
	<header class="race-room-nav">
		<a class="room-brand" href="/" aria-label="Typee, kembali ke beranda">TYPEE<span>.</span></a>
	</header>

	<main class="race-room-main">
		{#if loading}
			<div class="status-card">Menghubungkan ke room...</div>
		{:else if !room}
			<div class="status-card">
				<h1>Room tidak tersedia.</h1>
				<p>{errorMessage || 'Periksa kode room dan coba lagi.'}</p>
				<a href="/race">Kembali ke halaman race →</a>
			</div>
		{:else}
			<div class="room-grid">
				<section class="room-center" aria-label="Area race">
					{#if session}
						<div class="room-sidebar">
							<div class="phase-card waiting-card">
								<h2>Link</h2>
								<div class="waiting-card-body">
									<div class="invite-link">
										<div>
											<input
												id="room-link"
												aria-label="Tautan room"
												value={shareUrl || `/race/${code}`}
												readonly
											/>
											<button
												class="copy-link-button"
												type="button"
												aria-label={copied ? 'Tautan room disalin' : 'Salin tautan room'}
												title={copied ? 'Tautan disalin' : 'Salin tautan'}
												onclick={copyLink}
											>
												{#if copied}
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg
													>
												{:else}
													<svg
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="2"
														aria-hidden="true"
														><rect x="8" y="8" width="12" height="12" rx="2" /><path
															d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
														/></svg
													>
												{/if}
											</button>
										</div>
									</div>
									{#if self?.is_host && phase === 'waiting'}
										<button
											class="start-room-button"
											type="button"
											disabled={busy || players.length < 2}
											onclick={startRace}>{busy ? 'Memulai...' : 'Start Race'}</button
										>
									{:else if self?.is_host && phase === 'results' && !room.competition_ended}
										<button
											class="rematch-button"
											type="button"
											disabled={busy || !room.round_finished_at}
											onclick={startRematch}
											>{busy ? 'Menyiapkan...' : 'Main Lagi — Room yang Sama'}</button
										>
										<button
											class="complete-button"
											type="button"
											disabled={busy || !room.round_finished_at}
											onclick={completeCompetition}>Akhiri Pertandingan</button
										>
									{:else if !self?.is_host && phase === 'results' && !room.competition_ended}
										<p class="rematch-note">Menunggu host memulai ronde baru.</p>
									{:else if room.competition_ended}
										<p class="rematch-note">Pertandingan telah diakhiri.</p>
									{/if}
								</div>
							</div>
							<section class="chat-card" aria-label="Chat room">
								<h2>Chat</h2>
								<div class="chat-messages" role="log" aria-label="Riwayat chat" aria-live="polite">
									{#if chatLoading && chatMessages.length === 0}
										<p class="chat-empty">Memuat pesan...</p>
									{:else if chatMessages.length === 0}
										<p class="chat-empty">Belum ada pesan.</p>
									{/if}
									{#each chatMessages as message (message.id)}
										<div class="chat-message">
											<strong
												>{message.nickname}{message.player_id === session.player_id
													? ' (kamu)'
													: ''}</strong
											>
											<p>{message.text}</p>
										</div>
									{/each}
								</div>
								<form
									class="chat-form"
									onsubmit={(event) => {
										event.preventDefault();
										void sendChat();
									}}
								>
									<label class="sr-only" for="chat-message">Pesan chat</label>
									<input
										id="chat-message"
										bind:value={chatDraft}
										maxlength="200"
										autocomplete="off"
										placeholder="Tulis pesan..."
									/>
									<button
										type="submit"
										disabled={chatBusy || !chatDraft.trim()}
										aria-label="Kirim pesan">Kirim</button
									>
								</form>
								{#if chatError}<p class="chat-error" role="alert">{chatError}</p>{/if}
							</section>
						</div>
					{/if}
					<div class="snippet-card" class:activeRace={phase !== 'waiting'}>
						<div class="snippet-body">
							<div class="race-track" aria-label="Progres pemain">
								<div class="race-track-heading">
									<strong
										>{room.competition_ended
											? 'Pertandingan Selesai'
											: phase === 'waiting'
												? 'Menunggu Pemain'
												: phase === 'countdown'
													? 'Siap!'
													: phase === 'racing'
														? 'Go!'
														: 'Selesai!'}</strong
									>
									{#if phase !== 'countdown'}<span
											>{phase === 'waiting'
												? `${players.length} pemain`
												: raceClock(raceSecondsLeft)}</span
										>{/if}
								</div>
								<div
									class="race-lanes"
									class:two-columns={phase === 'waiting' || players.length > 3}
								>
									{#each players as player (player.id)}
										<div class="race-lane" data-player-id={player.id}>
											<span class="race-lane-name"
												>{player.nickname}{player.id === session?.player_id ? ' (kamu)' : ''}</span
											>
											<div class="race-lane-path">
												<span
													class="race-lane-avatar"
													style:left={`${laneProgress(player)}%`}
													aria-hidden="true">{avatarFor(player)}</span
												>
											</div>
											<div class="race-lane-score">
												{#if phase === 'results' && medalFor(player.id)}<span
														class="race-lane-place">{medalFor(player.id)}</span
													>{/if}
												<strong class="race-lane-wpm">{laneWpm(player)} WPM</strong>
											</div>
										</div>
									{/each}
									{#if phase === 'waiting'}
										{#each emptySlots as slot (slot)}
											<div
												class="race-lane placeholder"
												aria-label={`Slot pemain ${slot + 1} kosong`}
											>
												<span class="race-lane-name">Slot {slot + 1} kosong</span>
												<div class="race-lane-path">
													<span class="race-lane-avatar" aria-hidden="true"
														>{roomAvatars[slot]}</span
													>
												</div>
											</div>
										{/each}
									{/if}
								</div>
							</div>
							<div class="race-passage">
								<p id="race-passage-instructions" hidden>
									Ketik teks berikut: {room.passage}
								</p>
								{#if phase === 'racing' && session}
									<textarea
										class="race-typing-capture"
										aria-label="KETIK DI SINI"
										aria-describedby="race-passage-instructions"
										bind:this={raceInput}
										value={typed}
										maxlength={room.passage.length + maxExtraLetters}
										oninput={onRaceInput}
										aria-invalid={currentWordHasError}
										disabled={!!self?.finished_at}
										spellcheck="false"
										autocomplete="off"
										autocapitalize="off"></textarea>
								{/if}
								<div class="race-passage-text" aria-hidden="true">
									{#each passageSegments as segment (segment.start)}
										{#if segment.isWord}
											<span class="race-word" data-word-start={segment.start}>
												{#each Array.from(segment.text) as char, offset (offset)}<span
														class="race-letter"
														class:correct={segment.start <= (activeWord?.start ?? -1) &&
															segment.start + offset < typed.length &&
															typed[segment.start + offset] === char}
														class:wrong={segment.start === activeWord?.start &&
															offset < currentWordInput.length &&
															currentWordInput[offset] !== char}
														class:cursor={segment.start === activeWord?.start &&
															offset === currentWordInput.length &&
															phase === 'racing' &&
															!!session &&
															!self?.finished_at}>{char}</span
													>{/each}
												{#if segment.start === activeWord?.start}
													{#each Array.from(currentWordInput.slice(segment.text.length)) as char, index (index)}<span
															class="race-extra wrong">{char}</span
														>{/each}
													{#if phase === 'racing' && session && !self?.finished_at && currentWordInput.length >= segment.text.length && currentWordInput !== segment.text}<span
															class="race-word-end-cursor"
														></span>{/if}
												{/if}
											</span>
										{:else}
											{#each Array.from(segment.text) as char, offset (offset)}<span
													class:correct={segment.end <= (activeWord?.start ?? 0) &&
														segment.start + offset < typed.length &&
														typed[segment.start + offset] === char}
													class:cursor={segment.start === activeWord?.end &&
														currentWordInput === activeWord?.text &&
														segment.start + offset === typed.length &&
														phase === 'racing' &&
														!!session &&
														!self?.finished_at}>{char}</span
												>{/each}
										{/if}
									{/each}
								</div>
							</div>
							{#if phase === 'countdown'}
								<div class="countdown-overlay" role="status" aria-live="assertive">
									<span>Mulai dalam</span>
									<strong>{timeLeft}</strong>
								</div>
							{/if}
						</div>
					</div>

					{#if room.round_number > 0}
						<section class="standings-card" aria-label="Klasemen pertandingan">
							<div class="standings-heading">
								<h2>Klasemen</h2>
								<span>Emas 3 · Perak 2 · Perunggu 1</span>
							</div>
							{#if room.competition_ended}
								<p class="champion-banner" role="status">
									{#if leaders.length === 0}
										Pertandingan selesai tanpa peraih medali.
									{:else if leaders.length === 1}
										🏆 Pemenang: {leaders[0].nickname} · {leaders[0].points} poin
									{:else}
										🏆 Juara bersama: {leaders.map((player) => player.nickname).join(', ')} · {leaders[0]
											.points} poin
									{/if}
								</p>
							{/if}
							<ol class="standings-list">
								{#each standings as player (player.id)}
									<li>
										<span class="standing-player"
											><span aria-hidden="true">{avatarFor(player)}</span>
											{player.nickname}{player.id === session?.player_id ? ' (kamu)' : ''}</span
										>
										<span class="standing-medals" aria-label={`Medali ${player.nickname}`}>
											🥇{player.gold_count} 🥈{player.silver_count} 🥉{player.bronze_count}
										</span>
										<strong>{player.points} poin</strong>
									</li>
								{/each}
							</ol>
							<div class="round-history">
								<h3>Hasil per babak</h3>
								{#each rounds as round (round.id)}
									<p>
										<strong>Babak {round.number}</strong>
										<span
											>🥇 {round.gold ? playerName(round.gold) : '—'} · 🥈 {round.silver
												? playerName(round.silver)
												: '—'} · 🥉 {round.bronze ? playerName(round.bronze) : '—'}</span
										>
									</p>
								{/each}
								{#if hasMoreRounds}<button
										type="button"
										disabled={loadingRounds}
										onclick={() => loadRounds()}
									>
										{loadingRounds ? 'Memuat...' : 'Tampilkan babak sebelumnya'}
									</button>{/if}
								{#if roundsError}<p class="rounds-error" role="alert">{roundsError}</p>{/if}
							</div>
						</section>
					{/if}

					{#if phase === 'waiting' && !session && players.length >= roomAvatars.length}
						<div class="phase-card join-card">
							<h2>Room penuh</h2>
							<p>Room ini sudah berisi 10 pemain.</p>
						</div>
					{:else if phase === 'waiting' && !session}
						<div class="phase-card join-card">
							<h2>Gabung ke room</h2>
							<p>Masukkan nama pemain untuk mengikuti race ini.</p>
							<form
								class="room-join-form"
								onsubmit={(event) => {
									event.preventDefault();
									void joinRoom();
								}}
							>
								<label for="race-nickname">NAMA PEMAIN</label>
								<div class="join-controls">
									<input
										id="race-nickname"
										bind:value={nickname}
										minlength="2"
										maxlength="18"
										placeholder="Nama kamu"
										required
									/><button type="submit" disabled={busy}
										>{busy ? 'MENYAMBUNG...' : 'GABUNG RACE'}</button
									>
								</div>
							</form>
						</div>
					{:else if phase === 'racing'}
						{#if !session}<div class="phase-card spectator-card">
								<p>Race sedang berlangsung. Hasil akan muncul setelah selesai.</p>
							</div>{/if}
					{/if}
					{#if errorMessage}<p class="room-error" role="alert">{errorMessage}</p>{/if}
				</section>
			</div>
		{/if}
	</main>
</div>

<style>
	.race-room-shell {
		min-height: 100vh;
		background: #f4f6ff;
		color: #45484e;
		font-family: Arial, Helvetica, sans-serif;
	}

	.race-room-nav {
		min-height: 72px;
		padding: 0 max(24px, calc((100vw - 1280px) / 2));
		background: #512bd7;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
	}

	.room-brand {
		color: #fff;
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -1.5px;
	}

	.room-brand span {
		color: #d8cbff;
	}

	.race-room-main {
		width: min(100% - 48px, 1280px);
		margin: 0 auto;
		padding: 24px 0 70px;
	}

	.status-card {
		max-width: 540px;
		margin: 70px auto;
		padding: 28px;
		border-radius: 16px;
		background: #fff;
		box-shadow: 0 10px 24px #28204b1c;
	}

	.status-card h1 {
		font-size: 24px;
	}

	.status-card a {
		color: #512bd7;
		font-weight: 700;
	}

	.room-grid {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
		align-items: start;
		gap: 20px;
	}

	.room-center {
		display: contents;
	}

	.room-sidebar {
		grid-column: 2;
		grid-row: 1 / span 2;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.snippet-card {
		position: relative;
		grid-column: 1;
		grid-row: 1;
		min-width: 0;
	}

	.standings-card {
		grid-column: 1;
		grid-row: 2;
		min-width: 0;
		padding: 22px;
		border-radius: 16px;
		background: #fff;
		box-shadow: 0 10px 20px #28204b22;
		color: #263b72;
	}

	.standings-heading,
	.standings-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.standings-heading h2 {
		margin: 0;
		font-size: 20px;
	}

	.standings-heading > span {
		font-size: 12px;
		font-weight: 700;
	}

	.champion-banner {
		margin: 18px 0 0;
		padding: 13px 15px;
		border-radius: 10px;
		background: #fff4d3;
		font-weight: 800;
	}

	.standings-list {
		margin: 18px 0 0;
		padding: 0;
		list-style: none;
	}

	.standings-list li {
		min-height: 42px;
		padding: 8px 0;
		border-bottom: 1px solid #e9e9f1;
		font-size: 13px;
	}

	.standing-player {
		min-width: 0;
		flex: 1;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.standing-player > span {
		margin-right: 5px;
	}

	.standing-medals,
	.standings-list strong {
		white-space: nowrap;
	}

	.round-history {
		margin-top: 22px;
	}

	.round-history h3 {
		margin: 0 0 8px;
		font-size: 15px;
	}

	.round-history p {
		display: flex;
		gap: 12px;
		margin: 0;
		padding: 9px 0;
		border-top: 1px solid #e9e9f1;
		font-size: 13px;
	}

	.round-history p strong {
		min-width: 64px;
	}

	.round-history p span {
		overflow-wrap: anywhere;
	}

	.round-history button {
		margin-top: 10px;
		padding: 0;
		border: 0;
		background: none;
		color: #512bd7;
		font-weight: 700;
		cursor: pointer;
	}

	.round-history .rounds-error {
		color: #bc2440;
	}

	.join-card {
		grid-column: 2;
		grid-row: 1;
		min-width: 0;
	}

	.spectator-card {
		grid-column: 2;
		grid-row: 1;
	}

	.room-error {
		grid-column: 2;
		grid-row: 2;
	}

	.snippet-card,
	.phase-card,
	.chat-card {
		border-radius: 16px;
		background: #fff;
		overflow: hidden;
		box-shadow: 0 10px 20px #28204b22;
	}

	.waiting-card h2,
	.chat-card h2 {
		min-height: 55px;
		margin: 0;
		padding: 0 21px;
		background: #512bd7;
		color: #fff;
		display: flex;
		align-items: center;
		font-size: 16px;
		font-weight: 700;
	}

	.snippet-body {
		padding: 20px;
	}

	.countdown-overlay {
		position: absolute;
		inset: 0;
		z-index: 3;
		background: #ffffffa6;
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		color: #512bd7;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		text-align: center;
	}

	.countdown-overlay span {
		font-size: 16px;
		font-weight: 800;
	}

	.countdown-overlay strong {
		font-size: clamp(72px, 10vw, 112px);
		line-height: 1;
	}

	.race-track {
		margin-bottom: 22px;
		color: #263b72;
	}

	.race-track-heading {
		margin-bottom: 8px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 20px;
		font-weight: 800;
	}

	.race-lane {
		min-height: 62px;
		display: grid;
		grid-template-columns: 110px minmax(0, 1fr) 90px;
		align-items: center;
		gap: 8px;
		border-bottom: 2px dashed #d8bd00;
	}

	.race-lanes.two-columns {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: 18px;
	}

	.race-lanes.two-columns .race-lane {
		min-width: 0;
		min-height: 78px;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto 36px;
		gap: 0 6px;
		padding-top: 7px;
	}

	.race-lanes.two-columns .race-lane-path {
		grid-column: 1 / -1;
		grid-row: 2;
		margin: 0 18px;
	}

	.race-lanes.two-columns .race-lane-avatar {
		font-size: 28px;
	}

	.race-lane.placeholder {
		color: #81889a;
		border-bottom-color: #d9dee8;
	}

	.race-lane.placeholder .race-lane-avatar {
		left: 0;
		filter: grayscale(1);
		opacity: 0.4;
	}

	.race-lane-name {
		font-size: 13px;
		font-weight: 700;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.race-lane-path {
		position: relative;
		align-self: stretch;
		margin: 0 20px;
	}

	.race-lane-avatar {
		position: absolute;
		bottom: 4px;
		transform: translateX(-50%);
		font-size: 34px;
		line-height: 1;
		transition: left 240ms ease-out;
	}

	.race-lane-score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		white-space: nowrap;
	}

	.race-lane-place {
		font-size: 12px;
	}

	.race-lane-wpm {
		font-size: 13px;
		text-align: right;
		white-space: nowrap;
	}

	.race-passage {
		position: relative;
		min-height: 240px;
		padding: 12px;
		border: 2px solid #e1e2e8;
		border-radius: 16px;
		color: #45484e;
		font-size: 17px;
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1.85;
		overflow-wrap: anywhere;
	}

	.activeRace .race-passage {
		min-height: 145px;
		border-color: #cbd6e6;
		background: #fff;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 19px;
		font-weight: 500;
		line-height: 1.4;
	}

	.activeRace .race-word {
		line-height: 1.25;
	}

	.activeRace .race-letter,
	.activeRace .race-extra {
		font-size: 19px;
	}

	.race-typing-capture {
		position: absolute;
		inset: 0;
		z-index: 1;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: text;
	}

	.race-passage-text {
		pointer-events: none;
		white-space: pre-wrap;
	}

	.race-word {
		position: relative;
		display: inline-block;
		white-space: nowrap;
		vertical-align: baseline;
		font-size: 0;
		line-height: 1.85;
	}

	.race-letter {
		font-size: 17px;
	}

	.race-extra {
		font-size: 17px;
	}

	.race-word-end-cursor {
		display: inline-block;
		width: 3px;
		height: 19px;
		background: #fff16a;
		vertical-align: -3px;
	}

	.race-passage-text span.correct {
		background: #cce9f8;
	}

	.race-passage-text span.wrong {
		background: #ff3655;
	}

	.race-passage-text span.cursor {
		background: #fff16a;
	}

	.phase-card {
		margin-top: 0;
		padding: 25px;
	}

	.waiting-card {
		padding: 0;
	}

	.phase-card.waiting-card h2 {
		margin: 0;
		font-size: 16px;
	}

	.waiting-card-body {
		padding: 25px;
	}

	.waiting-card .invite-link {
		margin-top: 0;
	}

	.phase-card h2 {
		margin: 0 0 9px;
		font-size: 20px;
	}

	.phase-card p {
		margin: 0;
		color: #767984;
		font-size: 14px;
		line-height: 1.6;
	}

	.chat-card h2 {
		margin: 0;
	}

	.chat-messages {
		min-height: 155px;
		max-height: 260px;
		overflow-y: auto;
		padding: 17px 20px;
	}

	.chat-empty {
		margin: 0;
		color: #858793;
		font-size: 13px;
	}

	.chat-message + .chat-message {
		margin-top: 12px;
	}

	.chat-message strong {
		color: #263b72;
		font-size: 12px;
	}

	.chat-message p {
		margin: 4px 0 0;
		font-size: 13px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.chat-form {
		display: flex;
		gap: 8px;
		padding: 0 20px 20px;
	}

	.chat-form input {
		min-width: 0;
		min-height: 42px;
		flex: 1;
		padding: 0 10px;
		border: 2px solid #e1e2e8;
		border-radius: 8px;
		font: inherit;
		font-size: 13px;
	}

	.chat-form button {
		border: 0;
		border-radius: 8px;
		padding: 0 13px;
		background: #512bd7;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	.chat-form button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.chat-error {
		margin: -10px 20px 18px;
		color: #bc2440;
		font-size: 12px;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.room-join-form {
		margin-top: 23px;
	}

	.invite-link {
		margin-top: 23px;
	}

	.invite-link > div {
		position: relative;
	}

	.invite-link input {
		width: 100%;
		min-height: 46px;
		padding: 0 56px 0 12px;
		border: 2px solid #e1e2e8;
		border-radius: 8px;
		background: #f8f8fc;
		color: #45484e;
		font-size: 12px;
		box-shadow: none;
	}

	.start-room-button {
		min-height: 46px;
		padding: 0 15px;
		border: 0;
		border-radius: 8px;
		background: #512bd7;
		color: #fff;
		font-size: 12px;
		font-weight: 800;
	}

	.copy-link-button {
		position: absolute;
		top: 50%;
		right: 5px;
		width: 36px;
		height: 36px;
		padding: 8px;
		transform: translateY(-50%);
		border: 0;
		border-radius: 6px;
		background: #512bd7;
		color: #fff;
		cursor: pointer;
	}

	.copy-link-button svg {
		display: block;
		width: 20px;
		height: 20px;
	}

	.start-room-button {
		width: 100%;
		margin-top: 12px;
		background: #078849;
	}

	.start-room-button:disabled {
		opacity: 0.5;
	}

	.room-join-form label {
		display: block;
		margin-bottom: 10px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
	}

	.join-controls {
		display: flex;
		gap: 9px;
	}

	.join-controls input {
		min-width: 0;
		border: 2px solid #e1e2e8;
		border-radius: 8px;
		background: #fff;
		color: #45484e;
		outline: none;
		box-shadow: none;
	}

	.join-controls input {
		flex: 1;
		padding: 0 12px;
	}

	.join-controls button {
		min-height: 46px;
		padding: 0 15px;
		border: 0;
		border-radius: 8px;
		background: #078849;
		color: #fff;
		font-size: 11px;
		font-weight: 800;
		white-space: nowrap;
	}

	.join-controls input:focus {
		border-color: #512bd7;
		box-shadow: 0 0 0 3px #512bd71a;
	}

	.rematch-button {
		width: 100%;
		min-height: 46px;
		margin-top: 12px;
		border: 0;
		border-radius: 8px;
		background: #078849;
		color: #fff;
		font-size: 13px;
		font-weight: 800;
		cursor: pointer;
	}

	.rematch-button:disabled {
		opacity: 0.5;
	}

	.complete-button {
		width: 100%;
		min-height: 40px;
		margin-top: 9px;
		border: 1px solid #512bd7;
		border-radius: 8px;
		background: #fff;
		color: #512bd7;
		font-size: 12px;
		font-weight: 800;
		cursor: pointer;
	}

	.complete-button:disabled {
		opacity: 0.5;
	}

	.waiting-card-body .rematch-note {
		margin: 12px 0 0;
		color: #767984;
		font-size: 13px;
		line-height: 1.5;
	}

	.room-error {
		margin: 15px 0 0;
		color: #bc2440;
		font-size: 13px;
	}

	@media (max-width: 800px) {
		.race-room-main {
			width: min(100% - 32px, 520px);
		}

		.room-grid {
			display: flex;
			flex-direction: column;
		}

		.snippet-card,
		.standings-card,
		.room-sidebar,
		.waiting-card,
		.join-card,
		.spectator-card,
		.chat-card,
		.room-error {
			width: 100%;
		}

		.snippet-card {
			order: 1;
		}
		.room-sidebar,
		.join-card {
			order: 2;
		}
		.standings-card {
			order: 3;
		}
		.spectator-card {
			order: 2;
		}
		.room-error {
			order: 4;
		}

		.race-room-main {
			max-width: 520px;
		}

		.race-lane {
			grid-template-columns: 80px minmax(0, 1fr) 68px;
			gap: 4px;
		}

		.race-lane-name,
		.race-lane-wpm {
			font-size: 11px;
		}

		.race-lane-place {
			font-size: 10px;
		}

		.race-lane-path {
			margin: 0 16px;
		}

		.race-lane-avatar {
			font-size: 29px;
		}

		.race-lanes.two-columns {
			column-gap: 10px;
		}

		.race-lanes.two-columns .race-lane-name,
		.race-lanes.two-columns .race-lane-wpm {
			font-size: 10px;
		}
	}

	@media (max-width: 430px) {
		.race-room-nav {
			padding: 0 16px;
		}

		.join-controls {
			flex-direction: column;
		}

		.join-controls input {
			min-height: 46px;
		}
	}
</style>
