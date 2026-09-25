<script lang="ts">
	import { goto } from '$app/navigation';
	import { raceApi, saveSession } from '#lib/race/api.js';

	let roomCode = $state('');
	let nickname = $state('');
	let busy = $state(false);
	let errorMessage = $state('');

	function updateCode(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		roomCode = target.value
			.toUpperCase()
			.replace(/[^A-Z2-9]/g, '')
			.slice(0, 8);
		target.value = roomCode;
		errorMessage = '';
	}

	async function joinRoom() {
		if (!/^[A-Z2-9]{8}$/.test(roomCode)) {
			errorMessage = 'Masukkan kode room 8 karakter.';
			return;
		}
		await goto(`/race/${roomCode}`);
	}

	async function createRoom() {
		if (busy) return;
		const name = nickname.trim();
		if (name.length < 2) {
			errorMessage = 'Nama pemain minimal 2 karakter.';
			return;
		}
		busy = true;
		errorMessage = '';
		try {
			const state = await raceApi.create(name);
			saveSession(state.room.code, state.session);
			await goto(`/race/${state.room.code}`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Tidak dapat membuat room.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Multiplayer Race — Typee</title>
	<meta name="description" content="Gabung atau buat room multiplayer race di Typee." />
</svelte:head>

<div class="race-shell">
	<header class="race-nav">
		<a href="/" aria-label="Typee, kembali ke beranda">TYPEE<span>.</span></a>
	</header>
	<main>
		<section class="race-card" aria-labelledby="race-title">
			<div class="race-card-header"><h1 id="race-title">Multiplayer Race</h1></div>
			<div class="race-card-body">
				<form
					onsubmit={(event) => {
						event.preventDefault();
						void joinRoom();
					}}
				>
					<label for="room-code">Room code</label>
					<input
						id="room-code"
						value={roomCode}
						oninput={updateCode}
						maxlength="8"
						minlength="8"
						autocomplete="off"
						placeholder="Masukkan kode room"
						required
					/>
					<button type="submit">Join Room</button>
				</form>

				<div class="divider"><span>or</span></div>

				<form
					onsubmit={(event) => {
						event.preventDefault();
						void createRoom();
					}}
				>
					<label for="nickname">Nama pemain</label>
					<input
						id="nickname"
						bind:value={nickname}
						minlength="2"
						maxlength="18"
						placeholder="Nama kamu"
						required
					/>
					<button class="create-button" type="submit" disabled={busy}
						>{busy ? 'Membuat room...' : 'Create Room'}</button
					>
				</form>
				{#if errorMessage}<p class="form-error" role="alert">{errorMessage}</p>{/if}
			</div>
		</section>
	</main>
</div>

<style>
	.race-shell {
		min-height: 100vh;
		background: #f4f3fc;
		color: #45484e;
	}

	.race-nav {
		min-height: 72px;
		padding: 0 max(24px, calc((100vw - 1200px) / 2));
		background: #512bd7;
		color: #fff;
		display: flex;
		align-items: center;
	}

	.race-nav a {
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -1.5px;
	}

	.race-nav span {
		color: #d8cbff;
	}

	main {
		width: min(100% - 36px, 480px);
		margin: 0 auto;
		padding: 84px 0;
	}

	.race-card {
		border-radius: 17px;
		background: #fff;
		overflow: hidden;
		box-shadow:
			0 11px 20px #28204b23,
			0 3px 6px #28204b12;
	}

	.race-card-header {
		padding: 20px 26px;
		background: #512bd7;
		color: #fff;
	}

	h1 {
		margin: 0;
		font-size: 22px;
		letter-spacing: -0.03em;
	}

	.race-card-body {
		padding: 28px;
	}

	form {
		display: grid;
		gap: 11px;
	}

	label {
		font-size: 14px;
		font-weight: 700;
	}

	input {
		width: 100%;
		height: 50px;
		padding: 0 14px;
		border: 2px solid #e1e2e8;
		border-radius: 9px;
		background: #fff;
		color: #45484e;
		outline: none;
		box-shadow: none;
	}

	input:focus {
		border-color: #512bd7;
		box-shadow: 0 0 0 3px #512bd71a;
	}

	#room-code {
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	button {
		min-height: 50px;
		border: 0;
		border-radius: 9px;
		background: #512bd7;
		color: #fff;
		font-size: 15px;
		font-weight: 700;
	}

	button:not(:disabled):hover {
		filter: brightness(1.08);
	}

	.create-button {
		background: #078849;
	}

	.divider {
		margin: 27px 0;
		display: flex;
		align-items: center;
		gap: 14px;
		color: #868793;
		font-size: 13px;
	}

	.divider::before,
	.divider::after {
		content: '';
		height: 1px;
		flex: 1;
		background: #e1e2e8;
	}

	.form-error {
		margin: 18px 0 0;
		color: #bc2440;
		font-size: 13px;
	}

	@media (max-width: 600px) {
		main {
			padding-top: 32px;
		}
	}
</style>
