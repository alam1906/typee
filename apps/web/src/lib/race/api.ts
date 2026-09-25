import PocketBase from 'pocketbase';

export interface RaceRoom {
	id: string;
	code: string;
	passage: string;
	status: 'waiting' | 'running';
	starts_at: string;
	duration_seconds: number;
	round_number: number;
	round_finished_at: string;
	competition_ended: boolean;
}

export interface RacePlayer {
	id: string;
	nickname: string;
	avatar_index: number;
	is_host: boolean;
	finished_at: string;
	correct_chars: number;
	elapsed_ms: number;
	wpm: number;
	completed: boolean;
	gold_count: number;
	silver_count: number;
	bronze_count: number;
	points: number;
}

export interface RaceRound {
	id: string;
	number: number;
	gold: string;
	silver: string;
	bronze: string;
	ended_at: string;
}

export interface RaceSnapshot {
	room: RaceRoom;
	players: RacePlayer[];
	server_time: string;
}

export interface RaceSession {
	player_id: string;
	token: string;
}

export type JoinedRace = RaceSnapshot & { session: RaceSession };

export interface RaceChatMessage {
	id: string;
	player_id: string;
	nickname: string;
	text: string;
	sent_at: string;
}

export interface RaceEvent {
	kind:
		| 'player_joined'
		| 'started'
		| 'progress'
		| 'finished'
		| 'round_finished'
		| 'competition_ended'
		| 'rematch'
		| 'chat';
	message?: RaceChatMessage;
	player?: RacePlayer;
	room?: RaceRoom;
	round?: RaceRound;
	players?: RacePlayer[];
	server_time?: string;
	player_id?: string;
	correct_chars?: number;
	wpm?: number;
}

const baseUrl = import.meta.env.VITE_POCKETBASE_URL || '';
const browserIdKey = 'typee:browser-id';

function browserId(): string {
	try {
		const existing = localStorage.getItem(browserIdKey);
		if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		const created = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
		localStorage.setItem(browserIdKey, created);
		return created;
	} catch {
		throw new Error('Izinkan penyimpanan lokal browser untuk bermain multiplayer.');
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${baseUrl}/api/typee${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers }
	});
	if (!response.ok) {
		const data = await response.json().catch(() => ({}));
		throw new Error(data.message || 'Permintaan gagal. Coba lagi.');
	}
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

function credentials(session: RaceSession): HeadersInit {
	return { 'X-Typee-Player': session.player_id, 'X-Typee-Token': session.token };
}

export const raceApi = {
	create: (nickname: string) =>
		request<JoinedRace>('/rooms', {
			method: 'POST',
			body: JSON.stringify({ nickname, browser_id: browserId() })
		}),
	get: (code: string) => request<RaceSnapshot>(`/rooms/${code}`),
	rounds: (code: string, offset = 0) =>
		request<{ rounds: RaceRound[]; has_more: boolean }>(`/rooms/${code}/rounds/${offset}`),
	join: (code: string, nickname: string) =>
		request<JoinedRace>(`/rooms/${code}/join`, {
			method: 'POST',
			body: JSON.stringify({ nickname, browser_id: browserId() })
		}),
	start: (code: string, session: RaceSession) =>
		request<RaceSnapshot>(`/rooms/${code}/start`, {
			method: 'POST',
			headers: credentials(session)
		}),
	rematch: (code: string, session: RaceSession) =>
		request<RaceSnapshot>(`/rooms/${code}/rematch`, {
			method: 'POST',
			headers: credentials(session)
		}),
	complete: (code: string, session: RaceSession) =>
		request<RaceSnapshot>(`/rooms/${code}/complete`, {
			method: 'POST',
			headers: credentials(session)
		}),
	progress: (code: string, session: RaceSession, typed: string, startsAt: string) =>
		request<void>(`/rooms/${code}/progress`, {
			method: 'POST',
			headers: credentials(session),
			body: JSON.stringify({ typed, starts_at: startsAt })
		}),
	finish: (code: string, session: RaceSession, typed: string, startsAt: string) =>
		request<{ player: RacePlayer; state: RaceSnapshot }>(`/rooms/${code}/finish`, {
			method: 'POST',
			headers: credentials(session),
			body: JSON.stringify({ typed, starts_at: startsAt })
		}),
	chat: (code: string, session: RaceSession, text: string) =>
		request<{ message: RaceChatMessage }>(`/rooms/${code}/chat`, {
			method: 'POST',
			headers: credentials(session),
			body: JSON.stringify({ text })
		}),
	chatHistory: (code: string, session: RaceSession) =>
		request<{ messages: RaceChatMessage[] }>(`/rooms/${code}/chat`, {
			headers: credentials(session)
		})
};

let realtimeClient: PocketBase | undefined;

export function raceRealtime(): PocketBase {
	return (realtimeClient ??= new PocketBase(baseUrl || window.location.origin));
}

export function saveSession(code: string, session: RaceSession): void {
	localStorage.setItem(`typee:${code}`, JSON.stringify(session));
}

export function loadSession(code: string): RaceSession | null {
	try {
		const key = `typee:${code}`;
		const value = localStorage.getItem(key) ?? sessionStorage.getItem(key);
		if (!value) return null;
		const session = JSON.parse(value) as RaceSession;
		if (typeof session.player_id !== 'string' || typeof session.token !== 'string') return null;
		localStorage.setItem(key, value);
		sessionStorage.removeItem(key);
		return session;
	} catch {
		return null;
	}
}

export function clearSession(code: string): void {
	localStorage.removeItem(`typee:${code}`);
	sessionStorage.removeItem(`typee:${code}`);
}
