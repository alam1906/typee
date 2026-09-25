import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const mode = process.argv[2];
if (mode !== 'browser' && mode !== 'race') {
	throw new Error('Gunakan mode browser atau race.');
}

const projectRoot = resolve(import.meta.dir, '..');
const webRoot = join(projectRoot, 'apps/web');
const pocketbaseRoot = join(projectRoot, 'apps/pocketbase');
const testDirectory = await mkdtemp(join(tmpdir(), 'typee-smoke-'));
const children: ChildProcess[] = [];

async function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (!address || typeof address === 'string') {
				server.close();
				reject(new Error('Gagal memilih port uji.'));
				return;
			}
			server.close(() => resolvePort(address.port));
		});
	});
}

function start(
	name: string,
	command: string,
	args: string[],
	env = process.env,
	cwd = projectRoot
): ChildProcess {
	const child = spawn(command, args, {
		cwd,
		env,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	children.push(child);
	if (name !== 'pocketbase') {
		child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[${name}] ${chunk}`));
		child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[${name}] ${chunk}`));
	} else {
		child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[${name}] ${chunk}`));
	}
	return child;
}

async function waitFor(url: string, child: ChildProcess) {
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`Proses uji berhenti sebelum siap: ${url}`);
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (response.ok) return;
		} catch {
			// Proses masih memulai.
		}
		await new Promise((resolveWait) => setTimeout(resolveWait, 200));
	}
	throw new Error(`Proses uji tidak siap: ${url}`);
}

async function runScript(script: string, env: NodeJS.ProcessEnv) {
	const child = start('smoke', process.execPath, [script], env);
	const exitCode = await new Promise<number>((resolveExit, reject) => {
		child.once('error', reject);
		child.once('exit', (code) => resolveExit(code ?? 1));
	});
	if (exitCode !== 0) throw new Error(`Uji ${mode} gagal dengan kode ${exitCode}.`);
}

async function stop(child: ChildProcess) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()));
	child.kill('SIGTERM');
	await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 3000))]);
	if (child.exitCode === null && child.signalCode === null) {
		child.kill('SIGKILL');
		await exited;
	}
}

try {
	const pbPort = await freePort();
	const pbUrl = `http://127.0.0.1:${pbPort}`;
	const testDataDir = join(testDirectory, 'pb_data');
	// PocketBase opens its first-superuser installer in the user's browser on a fresh DB.
	// Bootstrap only this disposable test DB before serve so tests never create a Chrome tab.
	const init = start('pocketbase-init', join(pocketbaseRoot, 'pocketbase'), [
		'superuser',
		'create',
		'typee-smoke@example.invalid',
		randomBytes(24).toString('hex'),
		`--dir=${testDataDir}`,
		`--hooksDir=${join(pocketbaseRoot, 'pb_hooks')}`,
		`--migrationsDir=${join(pocketbaseRoot, 'pb_migrations')}`
	]);
	const initCode = await new Promise<number>((resolveExit, reject) => {
		init.once('error', reject);
		init.once('exit', (code) => resolveExit(code ?? 1));
	});
	if (initCode !== 0) throw new Error('Gagal menyiapkan superuser pada database uji sementara.');
	const pocketbase = start('pocketbase', join(pocketbaseRoot, 'pocketbase'), [
		'serve',
		`--http=127.0.0.1:${pbPort}`,
		`--dir=${testDataDir}`,
		`--hooksDir=${join(pocketbaseRoot, 'pb_hooks')}`,
		`--migrationsDir=${join(pocketbaseRoot, 'pb_migrations')}`
	]);
	await waitFor(`${pbUrl}/api/health`, pocketbase);

	const testEnv = {
		...process.env,
		TYPEE_SMOKE_PB_URL: pbUrl,
		TYPEE_SMOKE_DB_PATH: join(testDataDir, 'data.db')
	};
	if (mode === 'browser') {
		const sitePort = await freePort();
		const siteUrl = `http://127.0.0.1:${sitePort}`;
		const vite = start(
			'vite',
			process.execPath,
			[
				join(webRoot, 'node_modules/vite/bin/vite.js'),
				'--host',
				'127.0.0.1',
				'--port',
				String(sitePort),
				'--strictPort'
			],
			{ ...testEnv, TYPEE_PB_PROXY_URL: pbUrl, VITE_POCKETBASE_URL: '' },
			webRoot
		);
		await waitFor(siteUrl, vite);
		await runScript('scripts/smoke-browser.ts', { ...testEnv, TYPEE_SMOKE_SITE_URL: siteUrl });
	} else {
		await runScript('scripts/smoke-race.ts', testEnv);
	}
} finally {
	for (const child of children.reverse()) await stop(child);
	await rm(testDirectory, { recursive: true, force: true });
}
