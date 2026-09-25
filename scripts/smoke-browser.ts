import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const siteUrl = process.env.TYPEE_SMOKE_SITE_URL;
const pocketbaseUrl = process.env.TYPEE_SMOKE_PB_URL;
if (!siteUrl || !pocketbaseUrl) {
	throw new Error('Jalankan melalui bun run smoke:browser agar memakai database uji sementara.');
}

const browser = await chromium.launch({
	headless: true,
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});

try {
	const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const host = await hostContext.newPage();
	let soloApiRequests = 0;
	host.on('request', (request) => {
		if (request.url().includes('/api/typee/')) soloApiRequests += 1;
	});
	await host.goto(siteUrl);
	await host.locator('.landing-card').first().waitFor();
	assert.equal(await host.locator('.landing-card').count(), 2);
	await host.screenshot({ path: '/tmp/typee-home.png', fullPage: true });
	await host.getByRole('link', { name: /Practice/ }).click();
	await host.waitForURL('**/practice');
	const practiceInput = host.getByLabel('Ketik teks di sini');
	await practiceInput.waitFor();
	await host.waitForFunction(() => {
		const input = document.querySelector<HTMLInputElement>('.typing-capture');
		return document.activeElement === input;
	});
	assert.equal(await practiceInput.getAttribute('placeholder'), null);
	assert.equal(await host.locator('.input-card').count(), 0);
	assert.equal(await host.locator('.snippet-header').count(), 0);
	const practiceCard = await host.locator('.snippet-card').boundingBox();
	const statisticsCard = await host.locator('.metrics-card').boundingBox();
	assert.ok(practiceCard && statisticsCard);
	assert.ok(Math.abs(practiceCard.width / statisticsCard.width - 3) < 0.1);
	assert.ok(practiceCard.x + practiceCard.width <= statisticsCard.x);
	assert.equal(/[^a-z ]/.test((await host.locator('.passage-text').innerText()).trim()), false);
	const placement = await host.locator('.passage-box').evaluate((element) => {
		const text = element.querySelector('.passage-text');
		return {
			topGap: text!.getBoundingClientRect().top - element.getBoundingClientRect().top,
			alignment: getComputedStyle(text!).textAlign,
			background: getComputedStyle(element).backgroundColor
		};
	});
	assert.ok(placement.topGap < 10);
	assert.equal(placement.alignment, 'left');
	assert.equal(placement.background, 'rgba(0, 0, 0, 0)');
	assert.equal(await host.locator('.passage-text span.correct').count(), 0);
	assert.equal(await host.locator('.passage-text span.cursor').innerText(), 'p');
	assert.equal(
		await host
			.locator('.passage-text span.cursor')
			.evaluate((element) => getComputedStyle(element).backgroundColor),
		'rgb(255, 241, 106)'
	);
	await practiceInput.evaluate((element) => (element as HTMLInputElement).blur());
	await host.keyboard.press('p');
	assert.equal(await practiceInput.inputValue(), 'p');
	assert.equal(await host.locator('.passage-text span.correct').first().innerText(), 'p');
	assert.equal(await host.locator('.passage-text span.cursor').innerText(), 'a');
	assert.equal(
		await host
			.locator('.passage-text span.correct')
			.first()
			.evaluate((element) => getComputedStyle(element).backgroundColor),
		'rgb(210, 237, 251)'
	);
	await practiceInput.fill('px');
	assert.equal(await host.locator('.passage-text span.wrong').first().innerText(), 'a');
	assert.equal(
		await host
			.locator('.passage-text span.wrong')
			.first()
			.evaluate((element) => getComputedStyle(element).backgroundColor),
		'rgb(255, 49, 86)'
	);
	await practiceInput.fill('pagix');
	assert.equal(await host.locator('.passage-text span.wrong').first().innerText(), 'x');
	assert.equal(
		await host.locator('.metrics-card .metric').first().locator('strong').innerText(),
		'0'
	);
	await practiceInput.fill('PA!');
	assert.equal(await practiceInput.inputValue(), 'pa');
	await practiceInput.press('Space');
	assert.equal(await practiceInput.inputValue(), '');
	assert.equal(await host.locator('.passage-box span.cursor').innerText(), 'y');
	assert.equal(await host.locator('.passage-box span.skipped').count(), 2);
	assert.ok(
		parseFloat(await host.locator('.metrics-card .metric').last().locator('strong').innerText()) <
			100
	);
	await practiceInput.type('yang ');
	assert.equal(await practiceInput.inputValue(), '');
	await host.waitForTimeout(1100);
	assert.ok(
		Number(await host.locator('.metrics-card .metric').first().locator('strong').innerText()) > 0
	);
	assert.equal(await host.locator('.practice-result').count(), 0);
	const refreshButton = host.getByRole('button', { name: 'Ulangi latihan' });
	const refreshBounds = await refreshButton.boundingBox();
	const passageBounds = await host.locator('.passage-text').boundingBox();
	assert.ok(
		refreshBounds && passageBounds && refreshBounds.y + refreshBounds.height <= passageBounds.y
	);
	await refreshButton.click();
	assert.equal(await practiceInput.inputValue(), '');
	assert.equal(await host.locator('.passage-text span.cursor').innerText(), 'p');
	assert.equal(
		await host.locator('.metrics-card .metric').first().locator('strong').innerText(),
		'0'
	);
	assert.equal(
		await host.locator('.metrics-card .metric').last().locator('strong').innerText(),
		'100%'
	);
	await host.waitForFunction(() => {
		const input = document.querySelector<HTMLInputElement>('.typing-capture');
		return document.activeElement === input;
	});
	assert.equal(soloApiRequests, 0);
	await host.screenshot({ path: '/tmp/typee-practice.png', fullPage: true });
	await host.goto(siteUrl);
	await host.getByRole('link', { name: /Multiplayer Race/ }).click();
	await host.waitForURL('**/race');
	await host.getByRole('heading', { name: 'Multiplayer Race' }).waitFor();
	await host.screenshot({ path: '/tmp/typee-race.png', fullPage: true });
	await host.getByLabel('Nama pemain').fill('Pemain Uji A');
	await host.getByRole('button', { name: 'Create Room' }).click();
	await host.waitForURL(/\/race\/[A-Z2-9]{8}$/);
	const roomUrl = host.url();
	const code = roomUrl.split('/').pop();
	assert.ok(code);
	const hostSecondTab = await hostContext.newPage();
	await hostSecondTab.goto(roomUrl);
	await hostSecondTab.locator('.waiting-card').waitFor();
	assert.equal(await hostSecondTab.locator('.join-card').count(), 0);
	assert.equal(await hostSecondTab.locator('.race-lane[data-player-id]').count(), 1);
	await hostSecondTab.close();

	const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
	const guest = await guestContext.newPage();
	await guest.goto(siteUrl);
	await guest.locator('.landing-card').first().waitFor();
	await guest.screenshot({ path: '/tmp/typee-home-mobile.png', fullPage: true });
	await guest.getByRole('link', { name: /Practice/ }).click();
	await guest.waitForURL('**/practice');
	await guest.screenshot({ path: '/tmp/typee-practice-mobile.png', fullPage: true });
	await guest.goto(`${siteUrl}/race`);
	await guest.getByRole('heading', { name: 'Multiplayer Race' }).waitFor();
	await guest.screenshot({ path: '/tmp/typee-race-mobile.png', fullPage: true });
	await guest.getByLabel('Room code').fill(code.toLowerCase());
	assert.equal(await guest.getByLabel('Room code').inputValue(), code);
	await guest.getByRole('button', { name: 'Join Room' }).click();
	await guest.waitForURL(roomUrl);
	await guest.getByLabel('NAMA PEMAIN').fill('Pemain Uji B');
	await guest.getByRole('button', { name: /GABUNG RACE/ }).click();
	await guest.locator('.race-lane').filter({ hasText: 'Pemain Uji B' }).waitFor({ timeout: 10000 });
	await host.locator('.race-lane').filter({ hasText: 'Pemain Uji B' }).waitFor({ timeout: 10000 });
	const joinedState = await fetch(`${pocketbaseUrl}/api/typee/rooms/${code}`).then((response) =>
		response.json()
	);
	const originalPlayers = joinedState.players as {
		id: string;
		nickname: string;
		avatar_index: number;
	}[];
	assert.equal(originalPlayers.length, 2);
	assert.equal(new Set(originalPlayers.map((player) => player.avatar_index)).size, 2);
	for (const page of [host, guest]) {
		assert.equal(await page.locator('.race-lane').count(), 10);
		assert.equal(await page.locator('.race-lane.placeholder').count(), 8);
		assert.deepEqual(
			await page.locator('.race-lane[data-player-id] .race-lane-avatar').allInnerTexts(),
			['🦊', '🐼']
		);
		assert.equal(new Set(await page.locator('.race-lane-avatar').allInnerTexts()).size, 10);
		assert.equal(await page.locator('.race-word-markers, .race-position-avatar').count(), 0);
		assert.equal(await page.locator('.chat-card').count(), 1);
		assert.equal(await page.locator('.room-share').count(), 0);
	}
	await host.getByLabel('Pesan chat').fill('Halo dari host');
	await host.getByRole('button', { name: 'Kirim pesan' }).click();
	await guest.locator('.chat-message').filter({ hasText: 'Halo dari host' }).waitFor();
	assert.equal(await host.locator('.chat-message').count(), 1);
	await guest.getByLabel('Pesan chat').fill('Halo juga');
	await guest.getByRole('button', { name: 'Kirim pesan' }).click();
	await host.locator('.chat-message').filter({ hasText: 'Halo juga' }).waitFor();
	assert.equal(await guest.locator('.chat-message').count(), 2);
	await guest.reload();
	await guest.locator('.chat-message').filter({ hasText: 'Halo dari host' }).waitFor();
	assert.equal(await guest.locator('.chat-message').count(), 2);
	assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
	const hostInvite = await host.locator('.invite-link').boundingBox();
	const hostStart = await host.getByRole('button', { name: 'Start Race' }).boundingBox();
	assert.ok(hostInvite && hostStart && hostStart.y >= hostInvite.y + hostInvite.height);
	assert.equal(
		await host.locator('.waiting-card').getByRole('button', { name: 'Start Race' }).count(),
		1
	);
	for (const [page, mobile] of [
		[host, false],
		[guest, true]
	] as const) {
		const waitingCard = await page.locator('.waiting-card').boundingBox();
		const snippetCard = await page.locator('.snippet-card').boundingBox();
		const chatCard = await page.locator('.chat-card').boundingBox();
		assert.ok(waitingCard && snippetCard && chatCard);
		assert.equal(await page.locator('.snippet-card .card-heading').count(), 0);
		assert.equal(await page.locator('.snippet-card').getByText('you are').count(), 0);
		assert.equal(await page.locator('.race-track-heading strong').innerText(), 'Menunggu Pemain');
		assert.equal(await page.locator('.race-track-heading span').innerText(), '2 pemain');
		assert.ok(Math.abs(chatCard.y - waitingCard.y - waitingCard.height - 20) < 2);
		assert.equal(
			await page.locator('.player-strip, .room-actions, .timer-card, .results-card').count(),
			0
		);
		if (mobile) {
			assert.ok(snippetCard.y + snippetCard.height <= waitingCard.y);
			assert.ok(waitingCard.y + waitingCard.height <= chatCard.y);
		} else {
			assert.ok(snippetCard.x + snippetCard.width <= waitingCard.x);
			assert.ok(Math.abs(snippetCard.width / waitingCard.width - 3) < 0.1);
			assert.ok(waitingCard.y + waitingCard.height <= chatCard.y);
			assert.ok(Math.abs(waitingCard.width - chatCard.width) < 2);
		}
		assert.equal(await page.locator('.snippet-meta').count(), 0);
		const linkHeading = page.locator('.waiting-card h2');
		assert.equal(await linkHeading.innerText(), 'Link');
		assert.equal(await page.getByText('TAUTAN ROOM').count(), 0);
		assert.equal(await page.getByRole('textbox', { name: 'Tautan room' }).count(), 1);
		assert.equal(
			await linkHeading.evaluate((element) => getComputedStyle(element).color),
			'rgb(255, 255, 255)'
		);
		assert.equal(
			await linkHeading.evaluate((element) => getComputedStyle(element).backgroundColor),
			'rgb(81, 43, 215)'
		);
		const copyButton = page.getByRole('button', { name: 'Salin tautan room' });
		assert.equal((await copyButton.textContent())?.trim(), '');
		const inputBounds = await page.locator('#room-link').boundingBox();
		const buttonBounds = await copyButton.boundingBox();
		assert.ok(
			inputBounds &&
				buttonBounds &&
				buttonBounds.x >= inputBounds.x &&
				buttonBounds.x + buttonBounds.width <= inputBounds.x + inputBounds.width
		);
	}
	assert.equal(await guest.getByRole('button', { name: 'Start Race' }).count(), 0);
	await host.screenshot({ path: '/tmp/typee-room.png', fullPage: true });
	await guest.screenshot({ path: '/tmp/typee-room-mobile.png', fullPage: true });
	await host.getByRole('button', { name: 'Start Race' }).click();
	const countdown = host.locator('.countdown-overlay');
	await countdown.waitFor({ timeout: 2000 });
	assert.match(await countdown.locator('strong').innerText(), /^[123]$/);
	assert.equal(await host.locator('.countdown-card').count(), 0);
	assert.match(
		await countdown.evaluate((element) => getComputedStyle(element).backdropFilter),
		/blur\(5px\)/
	);
	const countdownBounds = await countdown.boundingBox();
	const snippetBounds = await host.locator('.snippet-card').boundingBox();
	assert.ok(
		countdownBounds &&
			snippetBounds &&
			Math.abs(
				countdownBounds.y + countdownBounds.height / 2 - snippetBounds.y - snippetBounds.height / 2
			) < 2
	);
	await host.screenshot({ path: '/tmp/typee-room-countdown.png', fullPage: true });
	const raceInput = host.getByLabel('KETIK DI SINI');
	await raceInput.waitFor({ timeout: 10000 });
	assert.equal(
		await host
			.locator('.race-passage')
			.evaluate((element) => getComputedStyle(element).backgroundColor),
		'rgb(255, 255, 255)'
	);
	assert.equal(await countdown.count(), 0);
	assert.equal(await host.locator('.input-card, .typing-input').count(), 0);
	assert.equal(await raceInput.evaluate((element) => document.activeElement === element), true);
	assert.equal(await host.locator('.race-lane').count(), 2);
	assert.equal(await guest.locator('.race-lane').count(), 2);
	assert.equal(await host.locator('.race-track-heading strong').innerText(), 'Go!');
	assert.match(await host.locator('.race-track-heading span').innerText(), /^\d+:\d{2}$/);
	const state = await fetch(`${pocketbaseUrl}/api/typee/rooms/${code}`).then((response) =>
		response.json()
	);
	const passage = state.room.passage as string;
	const hostId = (state.players as { id: string; nickname: string }[]).find(
		(player) => player.nickname === 'Pemain Uji A'
	)?.id;
	assert.ok(hostId);
	const words = Array.from(passage.matchAll(/\S+/g));
	const firstWord = words[0][0];
	const secondWordStart = words[1].index;
	const wrongFirst = passage[0] === 'x' ? 'y' : 'x';
	const wrongWord = wrongFirst + firstWord.slice(1);
	await raceInput.fill(wrongWord);
	assert.equal(await raceInput.inputValue(), wrongWord);
	assert.equal(await host.locator('.race-passage-text span.wrong').first().innerText(), passage[0]);
	await raceInput.fill(wrongWord + ' ' + words[1][0].slice(0, 2));
	assert.equal(await raceInput.inputValue(), wrongWord);
	assert.equal(
		await host.locator(`.race-word[data-word-start="${secondWordStart}"] span.correct`).count(),
		0
	);
	await raceInput.fill(wrongWord + 'z');
	assert.equal(await raceInput.inputValue(), wrongWord + 'z');
	assert.equal(await host.locator('.race-extra.wrong').innerText(), 'z');
	assert.equal(
		await host
			.locator('.race-passage-text span.wrong')
			.first()
			.evaluate((element) => getComputedStyle(element).backgroundColor),
		'rgb(255, 54, 85)'
	);
	await host.screenshot({ path: '/tmp/typee-room-wrong.png', fullPage: true });
	await raceInput.press('Space');
	assert.equal(await raceInput.inputValue(), wrongWord + 'z');
	await raceInput.press('Backspace');
	assert.equal(await raceInput.inputValue(), wrongWord);
	await raceInput.press('Backspace');
	assert.equal(await raceInput.inputValue(), wrongWord.slice(0, -1));
	await raceInput.fill(firstWord.slice(0, -1));
	await raceInput.press('Space');
	assert.equal(await raceInput.inputValue(), firstWord.slice(0, -1));
	await raceInput.fill(firstWord);
	assert.equal(await raceInput.inputValue(), firstWord);
	assert.equal(await host.locator('.race-passage-text span.wrong').count(), 0);
	await raceInput.press('Space');
	assert.equal(await raceInput.inputValue(), firstWord + ' ');
	await raceInput.fill(passage.slice(0, 40));
	assert.equal(await host.locator('.race-passage-text span.correct').count(), 40);
	assert.ok(
		Number.parseFloat(
			await host
				.locator(`.race-lane[data-player-id="${hostId}"] .race-lane-avatar`)
				.evaluate((element) => (element as HTMLElement).style.left)
		) > 0
	);
	assert.equal(await host.locator('.race-position-avatar').count(), 0);
	const raceTextTopGap = await host
		.locator('.race-passage')
		.evaluate(
			(element) =>
				element.querySelector('.race-passage-text')!.getBoundingClientRect().top -
				element.getBoundingClientRect().top
		);
	assert.ok(raceTextTopGap < 20, `Teks race terlalu jauh dari atas: ${raceTextTopGap}px`);
	await host.screenshot({ path: '/tmp/typee-room-active.png', fullPage: true });
	await guest.getByLabel('KETIK DI SINI').waitFor();
	await guest.waitForFunction(
		(playerId) => {
			const avatar = document.querySelector<HTMLElement>(
				`.race-lane[data-player-id="${playerId}"] .race-lane-avatar`
			);
			return avatar ? Number.parseFloat(avatar.style.left) > 0 : false;
		},
		hostId,
		{ timeout: 10_000 }
	);
	assert.ok(
		Number.parseFloat(
			await guest
				.locator(`.race-lane[data-player-id="${hostId}"] .race-lane-avatar`)
				.evaluate((element) => (element as HTMLElement).style.left)
		) > 0
	);
	assert.equal(await guest.locator('.race-position-avatar').count(), 0);
	assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
	await guest.screenshot({ path: '/tmp/typee-room-active-mobile.png', fullPage: true });
	await raceInput.fill(passage);
	await guest.getByLabel('KETIK DI SINI').fill(passage);
	await host.getByText('Selesai!', { exact: true }).waitFor({ timeout: 10000 });
	await guest.getByText('Selesai!', { exact: true }).waitFor({ timeout: 10000 });
	for (const page of [host, guest]) {
		assert.equal(await page.locator('.results-card').count(), 0);
		await page.locator('.race-lane-place').nth(1).waitFor();
		assert.equal(await page.locator('.race-lane-place').count(), 2);
		assert.deepEqual(await page.locator('.race-lane-place').allInnerTexts(), ['🥇 +3', '🥈 +2']);
		assert.equal(await page.locator('.standings-list li').count(), 2);
		assert.equal(await page.locator('.round-history p').count(), 1);
	}
	assert.deepEqual(
		await host.locator('.race-lane-place').allInnerTexts(),
		await guest.locator('.race-lane-place').allInnerTexts()
	);
	await host.screenshot({ path: '/tmp/typee-room-result.png', fullPage: true });
	await guest.screenshot({ path: '/tmp/typee-room-result-mobile.png', fullPage: true });
	assert.equal(
		await host
			.locator('.waiting-card')
			.getByRole('button', { name: 'Main Lagi — Room yang Sama' })
			.count(),
		1
	);
	assert.equal(await guest.getByRole('button', { name: 'Main Lagi — Room yang Sama' }).count(), 0);
	await host.getByRole('button', { name: 'Main Lagi — Room yang Sama' }).click();
	await host.getByText('Selesai!', { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
	await guest.getByText('Selesai!', { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
	assert.equal(new URL(host.url()).pathname, `/race/${code}`);
	assert.equal(new URL(guest.url()).pathname, `/race/${code}`);
	const rematchState = await fetch(`${pocketbaseUrl}/api/typee/rooms/${code}`).then((response) =>
		response.json()
	);
	assert.deepEqual(
		(rematchState.players as { id: string }[]).map((player) => player.id),
		originalPlayers.map((player) => player.id)
	);
	assert.equal(await host.locator('.race-lane-place').count(), 0);
	await host.getByRole('button', { name: 'Start Race' }).click();
	await host.getByLabel('KETIK DI SINI').waitFor({ timeout: 10000 });
	await guest.getByLabel('KETIK DI SINI').waitFor({ timeout: 10000 });
	assert.equal(await host.getByLabel('KETIK DI SINI').inputValue(), '');
	assert.equal(await host.locator('.race-passage-text span.correct').count(), 0);
	assert.equal(
		await host.locator('.standings-list li').first().locator('strong').innerText(),
		'3 poin'
	);
	const secondState = await fetch(`${pocketbaseUrl}/api/typee/rooms/${code}`).then((response) =>
		response.json()
	);
	const secondPassage = secondState.room.passage as string;
	await host.getByLabel('KETIK DI SINI').fill(secondPassage);
	await guest.getByLabel('KETIK DI SINI').fill(secondPassage);
	await host.locator('.round-history p').nth(1).waitFor({ timeout: 10000 });
	assert.equal(
		await host.locator('.standings-list li').first().locator('strong').innerText(),
		'6 poin'
	);
	await host.getByRole('button', { name: 'Akhiri Pertandingan' }).click();
	await host.getByText('Pertandingan Selesai', { exact: true }).waitFor();
	assert.match(
		await host.locator('.champion-banner').innerText(),
		/Pemenang: Pemain Uji A · 6 poin/
	);
	assert.equal(await host.getByRole('button', { name: 'Main Lagi — Room yang Sama' }).count(), 0);
	await guest.getByText('Pertandingan Selesai', { exact: true }).waitFor();
	assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
	const fourPage = await hostContext.newPage();
	await fourPage.goto(`${siteUrl}/race`);
	await fourPage.getByLabel('Nama pemain').fill('Empat Host');
	await fourPage.getByRole('button', { name: 'Create Room' }).click();
	await fourPage.waitForURL(/\/race\/[A-Z2-9]{8}$/);
	const fourCode = fourPage.url().split('/').pop();
	assert.ok(fourCode);
	for (const [index, nickname] of ['Empat Satu', 'Empat Dua', 'Empat Tiga'].entries()) {
		const response = await fetch(`${pocketbaseUrl}/api/typee/rooms/${fourCode}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				nickname,
				browser_id: (index + 101).toString(16).padStart(32, '0')
			})
		});
		assert.equal(response.status, 201);
	}
	await fourPage.locator('.race-lane[data-player-id]').nth(3).waitFor();
	assert.equal(await fourPage.locator('.race-lane[data-player-id]').count(), 4);
	assert.equal(await fourPage.locator('.race-lane.placeholder').count(), 6);
	assert.equal(await fourPage.locator('.race-lanes.two-columns').count(), 1);
	const desktopLanes = await fourPage
		.locator('.race-lane')
		.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
	assert.ok(Math.abs(desktopLanes[0].y - desktopLanes[1].y) < 2);
	assert.ok(Math.abs(desktopLanes[2].y - desktopLanes[3].y) < 2);
	assert.ok(desktopLanes[2].y > desktopLanes[0].y);
	await fourPage.screenshot({ path: '/tmp/typee-room-four-players.png', fullPage: true });
	await fourPage.setViewportSize({ width: 390, height: 844 });
	assert.ok(
		await fourPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
	);
	await fourPage.screenshot({ path: '/tmp/typee-room-four-players-mobile.png', fullPage: true });
	for (let number = 5; number <= 10; number++) {
		const response = await fetch(`${pocketbaseUrl}/api/typee/rooms/${fourCode}/join`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				nickname: `Pemain ${number}`,
				browser_id: (number + 101).toString(16).padStart(32, '0')
			})
		});
		assert.equal(response.status, 201);
	}
	await fourPage.locator('.race-lane[data-player-id]').nth(9).waitFor();
	assert.equal(await fourPage.locator('.race-lane.placeholder').count(), 0);
	assert.equal(await fourPage.locator('.race-track-heading span').innerText(), '10 pemain');
	assert.ok(
		await fourPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
	);
	await fourPage.screenshot({ path: '/tmp/typee-room-ten-players-mobile.png', fullPage: true });
	console.log(
		`Browser smoke lulus: practice, room ${code}, realtime, race, hasil, rematch. Screenshot room: /tmp/typee-room.png dan /tmp/typee-room-mobile.png`
	);
} finally {
	await browser.close();
}
