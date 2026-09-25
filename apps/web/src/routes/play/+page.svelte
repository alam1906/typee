<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { accuracy, correctPrefix, wordsPerMinute } from '#lib/game/metrics.js';
	import { soloPassages } from '#lib/game/passages.js';
	import { raceApi, saveSession } from '#lib/race/api.js';

	type Mode = 'solo' | 'race';
	let mode = $state<Mode>('solo');
	let passageIndex = $state(0);
	let typed = $state('');
	let startedAt = $state(0);
	let elapsedMs = $state(0);
	let done = $state(false);
	let nickname = $state('');
	let roomCode = $state('');
	let busy = $state(false);
	let errorMessage = $state('');
	let soloInput = $state<HTMLTextAreaElement>();

	const durationMs = 60_000;
	let passage = $derived(soloPassages[passageIndex]);
	let correct = $derived(correctPrefix(typed, passage));
	let wpm = $derived(wordsPerMinute(correct, elapsedMs));
	let precision = $derived(accuracy(typed, passage));
	let secondsLeft = $derived(Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000)));
	let progress = $derived(Math.round((correct / passage.length) * 100));

	onMount(() => {
		mode = new URLSearchParams(window.location.search).get('mode') === 'race' ? 'race' : 'solo';
		const timer = window.setInterval(() => {
			if (!startedAt || done) return;
			elapsedMs = Math.min(Date.now() - startedAt, durationMs);
			if (elapsedMs >= durationMs) done = true;
		}, 100);
		return () => window.clearInterval(timer);
	});

	function onSoloInput(event: Event) {
		if (done) return;
		const target = event.currentTarget as HTMLTextAreaElement;
		const next = target.value.slice(0, passage.length);
		if (!startedAt && next.length) startedAt = Date.now();
		typed = next;
		if (next === passage) {
			elapsedMs = Math.max(1000, Date.now() - startedAt);
			done = true;
		}
	}

	function resetSolo() {
		passageIndex = (passageIndex + 1) % soloPassages.length;
		typed = '';
		startedAt = 0;
		elapsedMs = 0;
		done = false;
		setTimeout(() => soloInput?.focus(), 0);
	}

	async function createRoom() {
		if (busy) return;
		busy = true;
		errorMessage = '';
		try {
			const state = await raceApi.create(nickname);
			saveSession(state.room.code, state.session);
			await goto(`/race/${state.room.code}`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Tidak dapat membuat room.';
		} finally {
			busy = false;
		}
	}

	async function openRoom() {
		const code = roomCode.trim().toUpperCase();
		if (!/^[A-Z2-9]{8}$/.test(code)) {
			errorMessage = 'Masukkan kode room 8 karakter.';
			return;
		}
		await goto(`/race/${code}`);
	}
</script>

<svelte:head>
	<title>Typee — Temukan ritme ketikanmu</title>
	<meta
		name="description"
		content="Latihan mengetik gratis dan race bersama teman secara realtime. Mulai tanpa akun."
	/>
</svelte:head>

<div class="site-shell">
	<header class="site-header">
		<a class="brand" href="/" aria-label="Typee, kembali ke beranda"
			><span class="brand-mark">t<span>.</span></span><span
				>typee<span class="brand-dot">.</span></span
			></a
		>
		<div class="header-right">
			<span class="online-dot"></span> YOUR TYPING SPACE <span class="header-divider">/</span> EST. 2026
		</div>
	</header>

	<main class="home-main">
		<section class="hero">
			<div class="eyebrow"><span class="eyebrow-line"></span> LESS NOISE, MORE FLOW</div>
			<h1>Find your <em>flow</em><span class="heading-period">.</span></h1>
			<p>
				Ruang sederhana untuk melatih kecepatan mengetik. Sendiri untuk fokus, bersama teman untuk
				sedikit kompetisi.
			</p>
			<div class="hero-note"><span class="note-star">✳</span> Siapkan jari. Mulai kapan saja.</div>
		</section>

		<section class="workspace" aria-label="Area typing test">
			<div class="workspace-top">
				<div class="mode-switch" role="group" aria-label="Pilih mode">
					<button
						type="button"
						aria-pressed={mode === 'solo'}
						class:active={mode === 'solo'}
						onclick={() => {
							mode = 'solo';
							errorMessage = '';
						}}>01 <span>Solo practice</span></button
					>
					<button
						type="button"
						aria-pressed={mode === 'race'}
						class:active={mode === 'race'}
						onclick={() => {
							mode = 'race';
							errorMessage = '';
						}}>02 <span>Multiplayer race</span></button
					>
				</div>
				<span class="workspace-status"
					><span class="status-square"></span>{mode === 'solo' ? 'LOCAL MODE' : 'LIVE MODE'}</span
				>
			</div>

			{#if mode === 'solo'}
				<div class="solo-panel">
					<div class="stats-row">
						<div class="stat">
							<span class="stat-label">TIME LEFT</span><strong class:urgent={secondsLeft <= 10}
								>{secondsLeft}<small>s</small></strong
							>
						</div>
						<div class="stat">
							<span class="stat-label">SPEED</span><strong>{wpm}<small>wpm</small></strong>
						</div>
						<div class="stat">
							<span class="stat-label">ACCURACY</span><strong>{precision}<small>%</small></strong>
						</div>
						<div class="stat stat-progress">
							<span class="stat-label">PROGRESS</span><strong>{progress}<small>%</small></strong>
						</div>
					</div>
					<div class="thin-progress"><div style:width={`${progress}%`}></div></div>
					<div class="passage" aria-label="Teks yang harus diketik">
						{#each Array.from(passage) as char, index (index)}<span
								class:correct={index < typed.length && typed[index] === char}
								class:wrong={index < typed.length && typed[index] !== char}
								class:cursor={index === typed.length && !done}>{char}</span
							>{/each}
					</div>
					<label class="input-label" for="solo-input">KETIK DI SINI <span>↓</span></label>
					<textarea
						id="solo-input"
						class="typing-input"
						bind:this={soloInput}
						value={typed}
						maxlength={passage.length}
						oninput={onSoloInput}
						disabled={done}
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
						placeholder="Mulai mengetik untuk menjalankan timer..."
						rows="2"></textarea>
					<div class="panel-footer">
						<span
							>{done
								? typed === passage
									? 'Selesai! Ritmemu bagus.'
									: 'Waktu habis. Coba lagi?'
								: 'Timer dimulai pada ketikan pertama.'}</span
						><button class="text-button" type="button" onclick={resetSolo}
							>Teks berikutnya <span>↗</span></button
						>
					</div>
				</div>
			{:else}
				<div class="race-panel">
					<div class="race-intro">
						<span class="race-icon">↗</span>
						<div>
							<h2>Race bareng teman.</h2>
							<p>
								Buat room privat, bagikan tautannya, dan adu ritme secara langsung. Tanpa daftar
								akun.
							</p>
						</div>
					</div>
					<form
						class="race-form"
						onsubmit={(event) => {
							event.preventDefault();
							void createRoom();
						}}
					>
						<label for="nickname">NAMA PEMAIN</label>
						<div class="form-inline">
							<input
								id="nickname"
								bind:value={nickname}
								maxlength="18"
								minlength="2"
								placeholder="Nama kamu"
								required
							/><button class="primary-button" type="submit" disabled={busy}
								>{busy ? 'MEMBUAT...' : 'BUAT ROOM'} <span>↗</span></button
							>
						</div>
						<p>2–10 pemain · 60 detik · host memulai race</p>
					</form>
					<div class="form-divider"><span>ATAU SUDAH PUNYA KODE?</span></div>
					<form
						class="join-inline"
						onsubmit={(event) => {
							event.preventDefault();
							void openRoom();
						}}
					>
						<input
							aria-label="Kode room"
							bind:value={roomCode}
							maxlength="8"
							placeholder="KODE ROOM"
						/><button type="submit">GABUNG <span>→</span></button>
					</form>
					{#if errorMessage}<p class="form-error" role="alert">{errorMessage}</p>{/if}
				</div>
			{/if}
		</section>

		<div class="bottom-strip">
			<span>BUILT FOR THE MOMENT</span><span
				>NO DISTRACTIONS <span class="strip-cross">✳</span> JUST TYPE</span
			>
		</div>
	</main>

	<footer class="site-footer"><span>TYPEE © 2026</span><span>MADE FOR BETTER TYPING</span></footer>
</div>
