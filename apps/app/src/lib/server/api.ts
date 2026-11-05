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

import { redirect } from '@sveltejs/kit';

import { getRequestEvent } from '$app/server';

import { formatFrame, readFrames } from '$lib/chat-stream';

import * as owe1 from './owe1/protocol';
import { clearSession } from './session';

// SvelteKit 3 removed $env/*. This module is server-only, so reading
// process.env directly is both safe and the documented replacement.
const API_URL = process.env.API_URL ?? 'http://api:3002';

/**
 * Plaintext mode, which only development may turn on (D22).
 *
 * With encryption on, an unsealed answer is refused rather than read: an
 * intermediary that can strip the sealing and hand back its own JSON would
 * otherwise be believed. The one exception is a transport error, which the
 * API marks with a header because the caller may hold no working key.
 */
const OWE1_ENABLED = process.env.OWE1_ENABLED !== 'false';
const TRANSPORT_ERROR_HEADER = 'x-owe-transport-error';

/**
 * May an unsealed answer be read?
 *
 * Only with encryption off, which is development, or when the API marked
 * the answer as a transport error, which it does precisely because the
 * caller may not be able to decrypt it. Exported so the rule is tested
 * without a socket.
 */
export function plaintextAllowed(encryptionOn: boolean, markedTransportError: boolean): boolean {
	return !encryptionOn || markedTransportError;
}

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
	/**
	 * Abandons the call.
	 *
	 * On a stream it is the browser disconnecting, which is what the stop
	 * button does: closing this hop tells the API to stop generating and
	 * persist the partial reply (CHAT-9). On an ordinary call it is a
	 * deadline, for the one route where a slow answer is worse than no
	 * answer: the import wizard's column mapping, which has a working path
	 * without it (AI-9).
	 */
	signal?: AbortSignal;
};

export type StreamOptions = Omit<RequestOptions, 'expect'>;

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
		if (error instanceof ApiError && error.status === 401 && options.token) {
			signOut();
		}
		throw error;
	}
}

/**
 * The API refused a token this server sent, so the session is over: the
 * secret was rotated, the user was removed, or the cookie came from
 * somewhere else. Clear it and send the reader to sign in, rather than
 * failing whatever page or action asked (a 500 that a reload repeats).
 *
 * Outside a request, in a test, there is nothing to clear and the error
 * is thrown as it was.
 */
function signOut(): void {
	let event;
	try {
		event = getRequestEvent();
	} catch {
		return;
	}
	clearSession(event.cookies);
	const target = event.url.pathname + event.url.search;
	redirect(303, `/login?next=${encodeURIComponent(target)}`);
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

/**
 * The same call, for a response that is an event stream.
 *
 * Returns the decrypted events as a stream of SSE bytes, ready to hand to
 * the browser. Nothing is buffered: each event is opened and written as it
 * arrives, because a chat that collects its tokens before showing them is a
 * slow request wearing a stream's clothes.
 *
 * The retry is the same as `api`'s, and only before the first event: once a
 * stream is open, the API restarting is a dropped connection, not something
 * a second request could take over from.
 */
export async function apiStream(options: StreamOptions): Promise<ReadableStream<Uint8Array>> {
	try {
		return await openStream(options, await currentSession());
	} catch (error) {
		if (error instanceof ApiError && error.code === 'CRYPTO_SESSION_UNKNOWN') {
			session = null;
			return openStream(options, await currentSession());
		}
		throw error;
	}
}

type PreparedRequest = {
	method: string;
	requestId: string;
	headers: Record<string, string>;
	payload?: string;
};

/** Everything a sealed request needs, shared by the two callers below. */
function prepare(options: RequestOptions, active: Session): PreparedRequest {
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

	return { method, requestId, headers, payload };
}

async function send<T>(options: RequestOptions, active: Session): Promise<Envelope<T>> {
	const { method, requestId, headers, payload } = prepare(options, active);

	// The path carries no query string: it travels in the header above.
	const response = await fetch(`${API_URL}${options.path}`, {
		method,
		headers,
		body: payload,
		signal: options.signal
	});

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
	if (!sealed && !plaintextAllowed(OWE1_ENABLED, response.headers.has(TRANSPORT_ERROR_HEADER))) {
		throw new owe1.Owe1Error('refusing an unsealed response on an encrypted hop');
	}
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

async function openStream(
	options: StreamOptions,
	active: Session
): Promise<ReadableStream<Uint8Array>> {
	const { method, requestId, headers, payload } = prepare(
		{ ...options, method: options.method ?? 'POST' },
		active
	);
	headers.accept = 'text/event-stream';

	const response = await fetch(`${API_URL}${options.path}`, {
		method,
		headers,
		body: payload,
		signal: options.signal
	});

	const contentType = response.headers.get('content-type') ?? '';

	// A failure before the stream opens answers with the normal envelope
	// (docs/api/conventions.md), so the shape of the answer is what decides
	// whether there is a stream to read at all.
	if (!response.ok || !contentType.includes('text/event-stream')) {
		throw await streamFailure(response, active, requestId);
	}

	if (!response.body) throw new Error('the API opened a stream with no body');

	return decryptEvents(response.body, active, requestId);
}

async function streamFailure(
	response: Response,
	active: Session,
	requestId: string
): Promise<Error> {
	const raw = await response.text();
	if (!raw) return new Error(`the API refused the stream: ${response.status}`);

	let plaintext = raw;
	try {
		const parsed = JSON.parse(raw);
		if ('n' in parsed && 'c' in parsed) {
			plaintext = owe1
				.open(
					active.keys.serverToClient,
					owe1.aadResponse(active.id, requestId, response.status),
					parsed
				)
				.toString();
		}

		const envelope = JSON.parse(plaintext) as Envelope<unknown>;
		if (envelope.error) return new ApiError(response.status, envelope.error);
	} catch {
		// Fall through: an unreadable body is still a failed stream.
	}

	return new Error(`the API refused the stream: ${response.status}`);
}

/**
 * Open each event and write it on.
 *
 * Every event is sealed on its own, with its position in the stream as part
 * of the associated data (docs/api/encryption.md#chat-stream-events), so a
 * dropped or reordered event fails to open rather than arriving quietly.
 * The counter below is that position, and it is why this cannot be a plain
 * passthrough however much cheaper that would be.
 *
 * What leaves here is plaintext. The browser hop holds no OWE1 key and runs
 * on TLS alone for v1 (D26).
 */
/** A disconnect, however the runtime chose to spell it. */
function isAbort(failure: unknown): boolean {
	return (
		failure instanceof Error &&
		(failure.name === 'AbortError' || failure.name === 'TimeoutError')
	);
}

function decryptEvents(
	body: ReadableStream<Uint8Array>,
	active: Session,
	requestId: string
): ReadableStream<Uint8Array> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = '';
	let seq = 0;

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			let chunk;
			try {
				chunk = await reader.read();
			} catch (failure) {
				// The hop above us went away mid-turn. That is an ending,
				// not a fault: the API has already persisted what arrived.
				if (isAbort(failure)) {
					controller.close();
					return;
				}
				throw failure;
			}

			if (chunk.done) {
				controller.close();
				return;
			}

			buffer += decoder.decode(chunk.value, { stream: true });
			const read = readFrames(buffer);
			buffer = read.rest;

			for (const frame of read.frames) {
				controller.enqueue(encoder.encode(formatFrame(frame.event, openEvent(frame.data))));
			}
		},
		cancel(reason) {
			// The browser went away. Dropping this hop is what stops the
			// generation two services down (CHAT-9).
			//
			// The rejection is caught rather than discarded. An unhandled
			// one ends the whole server process, which is what the stop
			// button did before this line existed.
			reader.cancel(reason).catch(() => {});
		}
	});

	function openEvent(data: string): string {
		const parsed = JSON.parse(data);

		// Plaintext in development, the same allowance `send` makes for a
		// body (`OWE1_ENABLED=false`, docs/architecture.md). The counter
		// does not move: it numbers sealed events, and the two modes are
		// never mixed on one stream. With encryption on, an unsealed event
		// is refused: accepting one would let an intermediary that strips
		// the sealing write the assistant's words.
		// An event stream has no transport error to mark: a failure after
		// the stream opens is a sealed `error` event.
		if (!('n' in parsed && 'c' in parsed)) {
			if (!plaintextAllowed(OWE1_ENABLED, false)) {
				throw new owe1.Owe1Error('refusing an unsealed event on an encrypted hop');
			}
			return data;
		}

		const plaintext = owe1
			.open(
				active.keys.serverToClient,
				owe1.aadStreamEvent(active.id, requestId, seq),
				parsed as owe1.SealedBody
			)
			.toString();

		seq += 1;
		return plaintext;
	}
}
