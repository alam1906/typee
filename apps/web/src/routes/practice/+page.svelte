<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { wordsPerMinute } from '#lib/game/metrics.js';
	import { soloPassages } from '#lib/game/passages.js';

	let completedWords = $state<string[]>([]);
	let draft = $state('');
	let startedAt = $state(0);
	let elapsedMs = $state(0);
	let done = $state(false);
	let input = $state<HTMLInputElement>();

	const durationMs = 60_000;
	let passage = $derived(
		soloPassages[0]
			.split('.')[0]
			.toLowerCase()
			.replace(/[^\p{L}\s]/gu, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
	let words = $derived(passage.split(' '));
	let score = $derived.by(() => {
		let correct = 0;
		let attempted = 0;
		for (let index = 0; index < completedWords.length; index += 1) {
			const expected = words[index];
			const actual = completedWords[index];
			attempted += Math.max(expected.length, actual.length);
			for (let character = 0; character < actual.length; character += 1) {
				if (actual[character] === expected[character]) correct += 1;
			}
			if (index < words.length - 1) {
				attempted += 1;
				correct += 1;
			}
		}
		const expected = words[completedWords.length] ?? '';
		attempted += draft.length;
		for (let character = 0; character < draft.length; character += 1) {
			if (draft[character] === expected[character]) correct += 1;
		}
		return { correct, attempted };
	});
	let wpm = $derived(wordsPerMinute(score.correct, elapsedMs));
	let precision = $derived(
		score.attempted ? Math.round((score.correct / score.attempted) * 100) : 100
	);
	let displayUnits = $derived.by(() => {
		const units: Array<{
			char: string;
			state: 'pending' | 'correct' | 'wrong' | 'skipped';
			cursor: boolean;
		}> = [];
		for (let index = 0; index < words.length; index += 1) {
			const expected = words[index];
			const actual = completedWords[index] ?? (index === completedWords.length ? draft : '');
			const currentWord = index === completedWords.length && !done;
			const visibleLength = Math.max(expected.length, actual.length);
			for (let character = 0; character < visibleLength; character += 1) {
				units.push({
					char: expected[character] ?? actual[character],
					state:
						character < actual.length
							? actual[character] === expected[character]
								? 'correct'
								: 'wrong'
							: index < completedWords.length
								? 'skipped'
								: 'pending',
					cursor: currentWord && character === draft.length
				});
			}
			if (index < words.length - 1) {
				units.push({
					char: ' ',
					state: index < completedWords.length ? 'correct' : 'pending',
					cursor: currentWord && draft.length >= visibleLength
				});
			} else if (currentWord && draft.length >= visibleLength) {
				units.push({ char: ' ', state: 'pending', cursor: true });
			}
		}
		return units;
	});
	onMount(() => {
		const focusFrame = window.requestAnimationFrame(() => input?.focus({ preventScroll: true }));
		window.addEventListener('keydown', handleWindowKeydown);
		const timer = window.setInterval(() => {
			if (!startedAt || done) return;
			elapsedMs = Math.min(Date.now() - startedAt, durationMs);
			if (elapsedMs >= durationMs) done = true;
		}, 100);
		return () => {
			window.cancelAnimationFrame(focusFrame);
			window.removeEventListener('keydown', handleWindowKeydown);
			window.clearInterval(timer);
		};
	});

	function handleInput(event: Event) {
		applyTyping((event.currentTarget as HTMLInputElement).value);
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (
			done ||
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
			applyTyping(draft.slice(0, -1));
		} else if (event.key === ' ' || /^\p{L}$/u.test(event.key)) {
			event.preventDefault();
			applyTyping(draft + event.key);
		} else {
			return;
		}
		input?.focus({ preventScroll: true });
	}

	function applyTyping(value: string) {
		if (done) return;
		let next = value.toLowerCase().replace(/[^\p{L}\s]/gu, '');
		if (!startedAt && next.length) startedAt = Date.now();
		if (/\s/.test(next)) {
			const parts = next.split(/\s+/);
			for (const word of parts.slice(0, -1)) {
				if (completedWords.length < words.length) completedWords = [...completedWords, word];
			}
			next = parts.at(-1) ?? '';
		}
		draft = completedWords.length < words.length ? next.slice(0, 32) : '';
		if (input) input.value = draft;
		if (
			completedWords.length >= words.length ||
			(completedWords.length === words.length - 1 && draft === words.at(-1))
		) {
			elapsedMs = Math.max(1000, Date.now() - startedAt);
			done = true;
		}
	}

	async function resetPractice() {
		completedWords = [];
		draft = '';
		startedAt = 0;
		elapsedMs = 0;
		done = false;
		await tick();
		input?.focus({ preventScroll: true });
	}
</script>

<svelte:head>
	<title>Practice — Typee</title>
	<meta name="description" content="Latihan mengetik sederhana selama 60 detik di Typee." />
</svelte:head>

<div class="practice-shell">
	<header class="practice-nav">
		<a href="/" aria-label="Typee, kembali ke beranda">TYPEE<span>.</span></a>
		<span>Practice</span>
	</header>

	<main class="practice-main">
		<div class="practice-workspace">
			<section class="snippet-card" aria-label="Teks latihan">
				<div class="practice-actions">
					<button
						class="refresh-button"
						type="button"
						aria-label="Ulangi latihan"
						title="Ulangi latihan"
						onclick={resetPractice}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path d="M20 11a8 8 0 1 1-2.2-5.5" />
							<path d="M20 4v5h-5" />
						</svg>
					</button>
				</div>
				<div class="passage-box">
					<p id="passage-instructions" class="sr-only">Ketik teks berikut: {passage}</p>
					<input
						class="typing-capture"
						aria-label="Ketik teks di sini"
						aria-describedby="passage-instructions"
						bind:this={input}
						value={draft}
						oninput={handleInput}
						maxlength="32"
						disabled={done}
						spellcheck="false"
						autocomplete="off"
						autocapitalize="off"
					/>
					<div class="passage-text" aria-hidden="true">
						{#each displayUnits as unit, index (index)}<span
								class:correct={unit.state === 'correct'}
								class:wrong={unit.state === 'wrong'}
								class:skipped={unit.state === 'skipped'}
								class:cursor={unit.cursor}>{unit.char}</span
							>{/each}
					</div>
				</div>
			</section>
		</div>

		<aside class="metrics-card" aria-label="Statistik latihan">
			<div class="metrics-header">Statistik</div>
			<div class="metric"><span>WPM</span><strong>{wpm}</strong></div>
			<div class="metric"><span>Akurasi</span><strong>{precision}<small>%</small></strong></div>
		</aside>
	</main>
</div>

<style>
	.practice-shell {
		min-height: 100vh;
		background: #f4f3fc;
		color: #45484e;
		font-family: Arial, Helvetica, sans-serif;
	}

	.practice-nav {
		min-height: 72px;
		padding: 0 max(24px, calc((100vw - 1200px) / 2));
		background: #512bd7;
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: space-between;
		box-shadow: 0 4px 18px #33218b1a;
	}

	.practice-nav a {
		font-size: 26px;
		font-weight: 800;
		letter-spacing: -1.5px;
	}

	.practice-nav a span {
		color: #d8cbff;
	}

	.practice-nav > span {
		font-size: 13px;
		font-weight: 700;
	}

	.practice-main {
		width: min(100% - 36px, 860px);
		margin: 0 auto;
		padding: 64px 0 80px;
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}

	.snippet-card,
	.metrics-card {
		background: #fff;
		border-radius: 17px;
		box-shadow:
			0 11px 20px #28204b23,
			0 3px 6px #28204b12;
		overflow: hidden;
	}

	.snippet-card {
		padding: 20px;
	}

	.practice-actions {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 8px;
	}

	.refresh-button {
		width: 32px;
		height: 32px;
		padding: 5px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: #512bd7;
		cursor: pointer;
	}

	.refresh-button:hover,
	.refresh-button:focus-visible {
		background: #eeeafd;
	}

	.refresh-button svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.passage-box {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		min-height: 220px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: clamp(24px, 3vw, 31px);
		line-height: 1.65;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.typing-capture {
		position: absolute;
		inset: 0;
		z-index: 2;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: text;
	}

	.passage-text {
		position: relative;
		color: #596170;
		pointer-events: none;
		text-align: left;
	}

	.passage-text span.correct {
		color: #485366;
		background: #d2edfb;
	}

	.passage-text span.wrong,
	.passage-text span.skipped {
		color: #272d39;
		background: #ff3156;
	}

	.passage-text span.cursor {
		color: #272d39;
		background: #fff16a;
	}

	.metrics-header {
		padding: 18px 20px;
		background: #512bd7;
		color: #fff;
		font-size: 16px;
		font-weight: 700;
	}

	.metric {
		margin: 0 20px;
		padding: 22px 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.metric + .metric {
		border-top: 1px solid #e7e6ec;
	}

	.metric > span {
		color: #777780;
		font-size: 13px;
		font-weight: 700;
	}

	.metric strong {
		color: #512bd7;
		font-size: 38px;
		line-height: 1;
		letter-spacing: -0.05em;
	}

	.metric small {
		margin-left: 2px;
		font-size: 21px;
	}

	@media (max-width: 700px) {
		.practice-main {
			padding-top: 28px;
			grid-template-columns: 1fr;
		}

		.passage-box {
			min-height: 190px;
			font-size: 23px;
		}

		.metrics-card {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.metrics-header {
			grid-column: 1 / -1;
		}

		.metric + .metric {
			border-top: 0;
			border-left: 1px solid #e7e6ec;
			padding-left: 20px;
			margin-left: 0;
		}
	}
</style>
