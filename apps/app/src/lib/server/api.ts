/**
 * The one client of the API.
 *
 * Server only. The browser never calls the API directly (D5, PLT-4), so this
 * module is the single place that holds the crypto session, attaches the
 * bearer token, and knows the envelope shape.
 *
 * It owns one OWE1 session for the whole process and re-handshakes on
 * `CRYPTO_SESSION_UNKNOWN`, which happens whenever the API restarts.
 */

import { randomUUID } from 'node:crypto';

import * as owe1 from './owe1/protocol';

// SvelteKit 3 removed $env/*. This module is server-only, so reading
// process.env directly is both safe and the documented replacement.
const API_URL = process.env.API_URL ?? 'http://api:3002';

export type Envelope<T> = {
	data: T | null;
	error: ApiErrorBody | null;
	meta: { request_id: string; page?: number; limit?: number; total?: number; total_pages?: number };
};

export type ApiErrorBody = {
	code: string;
	message: string;
	hint?: string;
	fields?: Record<string, string>;
	request_id: string;
};

/** A failed call. Carries the code, which is what callers branch on. */
export class ApiError extends Error {
	readonly code: string;
	readonly status: number;
	readonly fields?: Record<string, string>;

	constructor(status: number, body: ApiErrorBody) {
		super(body.message);
		this.name = 'ApiError';
		this.code = body.code;
		this.status = status;
		this.fields = body.fields;
	}
}

type Session = {
	id: string;
	keys: owe1.SessionKeys;
	expiresAt: number;
};

let session: Session | null = null;
let inflight: Promise<Session> | null = null;

/** Pinned signing keys, read once. A client that cannot verify stops. */
let pinnedKeys: Map<string, Buffer> | null = null;

async function loadPinnedKeys(): Promise<Map<string, Buffer>> {
	if (pinnedKeys) return pinnedKeys;

	const configured = process.env.CRYPTO_SIGNING_PUBLIC_KEYS?.trim();
	if (configured) {
		pinnedKeys = new Map(
			configured.split(',').map((pair: string) => {
				const [kid, key] = pair.split(':');
				return [kid.trim(), owe1.unb64(key.trim())] as const;
			})
		);
		return pinnedKeys;
	}

	// Development only: trust what the local API publishes. A production
	// build without pinned keys is refused below.
	if (process.env.APP_ENV === 'production') {
		throw new Error('CRYPTO_SIGNING_PUBLIC_KEYS is required in production');
	}

	const response = await fetch(`${API_URL}/.well-known/oewang-keys`);
	if (!response.ok) throw new Error(`cannot read signing keys: ${response.status}`);

	const keys: Array<{ kid: string; public_key: string }> = await response.json();
	pinnedKeys = new Map(keys.map((k) => [k.kid, owe1.unb64(k.public_key)]));
	return pinnedKeys;
}

async function handshake(): Promise<Session> {
	const pinned = await loadPinnedKeys();

	const { privateKey, publicKey } = owe1.generateKeyPair();
	const clientNonce = Buffer.from(randomUUID().replace(/-/g, ''), 'hex');

	const response = await fetch(`${API_URL}/v1/handshake`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			v: owe1.VERSION,
			client_public_key: owe1.b64(publicKey),
			client_nonce: owe1.b64(clientNonce)
		})
	});

	if (!response.ok) throw new Error(`handshake failed: ${response.status}`);

	const body = (await response.json()) as {
		session_id: string;
		server_public_key: string;
		server_nonce: string;
		server_time: number;
		expires_at: number;
		kid: string;
		signature: string;
	};

	const pinnedKey = pinned.get(body.kid);
	if (!pinnedKey) throw new owe1.Owe1Error(`unknown signing key: ${body.kid}`);

	// Verify or stop. Never fall back to plaintext.
	owe1.verifyHandshake(
		pinnedKey,
		owe1.unb64(body.signature),
		owe1.transcript(
			publicKey,
			owe1.unb64(body.server_public_key),
			clientNonce,
			owe1.unb64(body.server_nonce),
			body.session_id,
			body.expires_at,
			body.server_time
		)
	);

	return {
		id: body.session_id,
		keys: owe1.deriveKeys(
			privateKey,
			owe1.unb64(body.server_public_key),
			clientNonce,
			owe1.unb64(body.server_nonce),
			body.session_id
		),
		expiresAt: body.expires_at
	};
}

/** One handshake at a time, however many requests arrive at once. */
async function currentSession(): Promise<Session> {
	if (session && session.expiresAt > owe1.nowSecs() + 60) return session;
	if (inflight) return inflight;

	inflight = handshake()
		.then((fresh) => {
			session = fresh;
			return fresh;
		})
		.finally(() => {
			inflight = null;
		});

	return inflight;
}

export type RequestOptions = {
	method?: string;
	path: string;
	query?: URLSearchParams | string;
	body?: unknown;
	/** The caller's access token, read from the cookie by the route. */
	token?: string;
	/**
	 * What the body is, once decrypted. `json` is the envelope; `text` is
	 * anything that is not, which so far means the CSV export. The OWE1
	 * layer seals both the same way, so only the parse differs.
	 */
	expect?: 'json' | 'text';
};

/**
 * Call the API and return the decrypted envelope.
 *
 * Retries exactly once on `CRYPTO_SESSION_UNKNOWN`, which is what an API
 * restart looks like from here. Any other failure is surfaced.
 */
export async function api<T>(options: RequestOptions): Promise<Envelope<T>> {
	try {
		return await send<T>(options, await currentSession());
	} catch (error) {
		if (error instanceof ApiError && error.code === 'CRYPTO_SESSION_UNKNOWN') {
			session = null;
			return send<T>(options, await currentSession());
		}
		throw error;
	}
}

/**
 * The same call, for a response that is a file rather than an envelope.
 *
 * Returns the decrypted text. A CSV wrapped in JSON would have to be
 * unwrapped before it could be saved, so the export answers with the file
 * itself (TXN-10).
 */
export async function apiText(options: RequestOptions): Promise<string> {
	const result = await api<string>({ ...options, expect: 'text' });
	return typeof result.data === 'string' ? result.data : '';
}

async function send<T>(options: RequestOptions, active: Session): Promise<Envelope<T>> {
	const method = options.method ?? 'GET';
	const path = options.path;
	const requestId = randomUUID().replace(/-/g, '').toUpperCase();
	const timestamp = owe1.nowSecs();

	const query =
		typeof options.query === 'string' ? options.query : (options.query?.toString() ?? '');

	const headers: Record<string, string> = {
		'content-type': owe1.CONTENT_TYPE,
		'x-owe-session': active.id,
		'x-owe-request-id': requestId,
		'x-owe-timestamp': String(timestamp),
		// Required even when empty, so a stripped filter cannot pass unnoticed.
		'x-owe-query': owe1.sealField(
			active.keys.clientToServer,
			owe1.aadQuery(active.id, method, path, requestId, timestamp),
			Buffer.from(query)
		)
	};

	if (options.token) headers.authorization = `Bearer ${options.token}`;

	let payload: string | undefined;
	if (options.body !== undefined) {
		payload = JSON.stringify(
			owe1.seal(
				active.keys.clientToServer,
				owe1.aadRequest(active.id, method, path, requestId, timestamp),
				Buffer.from(JSON.stringify(options.body))
			)
		);
	}

	// The path carries no query string: it travels in the header above.
	const response = await fetch(`${API_URL}${path}`, { method, headers, body: payload });

	if (response.status === 204) {
		return { data: null, error: null, meta: { request_id: requestId } };
	}

	const raw = await response.text();
	if (!raw) {
		return { data: null, error: null, meta: { request_id: requestId } };
	}

	const parsed = JSON.parse(raw);

	// Transport errors answer in plaintext: the caller may hold no key.
	const sealed = 'n' in parsed && 'c' in parsed;
	const plaintext = sealed
		? owe1
				.open(
					active.keys.serverToClient,
					owe1.aadResponse(active.id, requestId, response.status),
					parsed
				)
				.toString()
		: raw;

	if (options.expect === 'text') {
		// A failure still answers with the envelope, whatever the success
		// shape is, so an error has to be recognised before the body is
		// handed back as a file.
		if (!response.ok) {
			const envelope = JSON.parse(plaintext) as Envelope<unknown>;
			if (envelope.error) throw new ApiError(response.status, envelope.error);
		}
		return { data: plaintext as T, error: null, meta: { request_id: requestId } };
	}

	const envelope: Envelope<T> = sealed ? JSON.parse(plaintext) : parsed;

	if (envelope.error) {
		throw new ApiError(response.status, envelope.error);
	}

	return envelope;
}
