<svelte:head>
	<title>Typee — Typing practice dan multiplayer race</title>
	<meta
		name="description"
		content="Latihan mengetik sendiri atau balapan realtime bersama teman di Typee."
	/>
</svelte:head>

<div class="landing-shell">
	<header class="landing-header">
		<nav class="landing-nav" aria-label="Navigasi utama">
			<a class="landing-brand" href="/" aria-label="Typee, beranda">TYPEE<span>.</span></a>
			<button class="landing-login" type="button" disabled title="Login segera hadir">LOGIN</button>
		</nav>
	</header>

	<main class="landing-main">
		<div class="landing-cards" aria-label="Pilih mode mengetik">
			<a class="landing-card practice-card" href="/practice">
				<span class="card-topline">01 / SOLO</span>
				<span class="card-content">
					<strong>Practice <span aria-hidden="true">↗</span></strong>
					<span>Latihan mengetik dengan ritmemu sendiri.</span>
				</span>
			</a>
			<a class="landing-card race-card" href="/race">
				<span class="card-topline">02 / REALTIME</span>
				<span class="card-content">
					<strong>Multiplayer Race <span aria-hidden="true">↗</span></strong>
					<span>Buat room dan balapan bersama teman.</span>
				</span>
			</a>
		</div>
	</main>
</div>

<style>
	.landing-shell {
		min-height: 100vh;
		background: #f4f6ff;
		color: #292638;
	}

	.landing-header {
		background: #512bd7;
		color: #fff;
		box-shadow: 0 4px 18px #33218b1a;
	}

	.landing-nav {
		width: min(100% - 48px, 1200px);
		min-height: 74px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}

	.landing-brand {
		color: #fff;
		font-size: 27px;
		font-weight: 800;
		letter-spacing: -1.5px;
		line-height: 1;
	}

	.landing-brand span {
		color: #d8cbff;
	}

	.landing-login {
		border: 0;
		background: transparent;
		color: #fff;
		font-size: 13px;
		font-weight: 800;
		letter-spacing: 0.07em;
		padding: 12px 0 12px 16px;
	}

	.landing-login:disabled {
		color: #fff;
		cursor: not-allowed;
		opacity: 0.78;
	}

	.landing-main {
		width: min(100% - 48px, 860px);
		margin: 0 auto;
		padding: clamp(100px, 16vh, 180px) 0 64px;
	}

	.landing-cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 22px;
	}

	.landing-card {
		min-height: 220px;
		padding: 25px 28px 28px;
		border-radius: 17px;
		color: #fff;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		box-shadow:
			0 12px 28px #35307e24,
			0 3px 0 #28196f2b;
		transition:
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.landing-card:hover {
		transform: translateY(-4px);
		box-shadow:
			0 18px 34px #35307e30,
			0 3px 0 #28196f2b;
	}

	.landing-card:focus-visible {
		outline: 3px solid #25127c;
		outline-offset: 4px;
	}

	.practice-card {
		background: #078849;
	}

	.race-card {
		background: #522bd7;
	}

	.card-topline {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.12em;
		opacity: 0.77;
	}

	.card-content {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}

	.card-content strong {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: clamp(24px, 3vw, 31px);
		line-height: 1.15;
		letter-spacing: -0.04em;
	}

	.card-content strong span {
		font-size: 27px;
		font-weight: 400;
		line-height: 1;
	}

	.card-content > span {
		font-size: 14px;
		line-height: 1.5;
		opacity: 0.9;
	}

	@media (max-width: 640px) {
		.landing-nav,
		.landing-main {
			width: min(100% - 36px, 860px);
		}

		.landing-nav {
			min-height: 68px;
		}

		.landing-main {
			padding-top: 90px;
		}

		.landing-cards {
			grid-template-columns: 1fr;
			gap: 16px;
		}

		.landing-card {
			min-height: 185px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.landing-card {
			transition: none;
		}
	}
</style>
