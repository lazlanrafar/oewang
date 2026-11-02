/**
 * OWE1 payload encryption, Node side.
 *
 * Server only. SvelteKit refuses to bundle `src/lib/server/` into client
 * code, which makes that boundary a build error rather than a convention.
 *
 * The wire contract is specified in docs/api/encryption.md and pinned by the
 * shared vectors at apps/api/crates/domain/testdata/owe1-vectors.json. This
 * module and its Rust and Python counterparts run the same file, because
 * three implementations of one protocol drift unless something holds them to
 * the same bytes.
 *
 * Everything here comes from `node:crypto`. No third-party crypto dependency
 * is permitted (docs/api/encryption.md#primitives).
 */

import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createPrivateKey,
	createPublicKey,
	diffieHellman,
	generateKeyPairSync,
	hkdfSync,
	randomBytes,
	verify,
	type KeyObject
} from 'node:crypto';

export const VERSION = 1;
export const NONCE_LEN = 12;
export const CONTENT_TYPE = 'application/vnd.oewang.owe1+json';

const TRANSCRIPT_LABEL = Buffer.from('oewang/owe1/handshake');
const INFO_C2S = 'oewang/owe1/c2s/';
const INFO_S2C = 'oewang/owe1/s2c/';

/** Any failure to open, verify or derive. Deliberately undifferentiated: a
 * caller must not branch on why a message failed to open. */
export class Owe1Error extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'Owe1Error';
	}
}

export type SealedBody = { n: string; c: string };

export type SessionKeys = {
	clientToServer: Buffer;
	serverToClient: Buffer;
};

/** base64url without padding (RFC 4648 section 5). */
export function b64(data: Buffer | Uint8Array): string {
	return Buffer.from(data).toString('base64url');
}

export function unb64(value: string): Buffer {
	return Buffer.from(value, 'base64url');
}

// ------------------------------------------------------------ associated data
//
// Changing one of these strings breaks every client. They are the wire
// contract, not an implementation detail.

export function aadRequest(
	sessionId: string,
	method: string,
	path: string,
	requestId: string,
	timestamp: number
): Buffer {
	return Buffer.from(`OWE1|req|${sessionId}|${method}|${path}|${requestId}|${timestamp}`);
}

export function aadQuery(
	sessionId: string,
	method: string,
	path: string,
	requestId: string,
	timestamp: number
): Buffer {
	return Buffer.from(`OWE1|qry|${sessionId}|${method}|${path}|${requestId}|${timestamp}`);
}

export function aadResponse(sessionId: string, requestId: string, status: number): Buffer {
	return Buffer.from(`OWE1|res|${sessionId}|${requestId}|${status}`);
}

export function aadStreamEvent(sessionId: string, requestId: string, seq: number): Buffer {
	return Buffer.from(`OWE1|sse|${sessionId}|${requestId}|${seq}`);
}

// ------------------------------------------------------------ handshake

/** Raw 32 bytes to a Node X25519 key object, via the minimal DER wrappers.
 * Node has no from-raw-bytes constructor for these, so the prefixes below are
 * the standard SPKI and PKCS#8 headers for X25519. */
const X25519_SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
const X25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');

export function x25519PublicFromRaw(raw: Buffer): KeyObject {
	return createPublicKey({
		key: Buffer.concat([X25519_SPKI_PREFIX, raw]),
		format: 'der',
		type: 'spki'
	});
}

export function x25519PrivateFromRaw(raw: Buffer): KeyObject {
	return createPrivateKey({
		key: Buffer.concat([X25519_PKCS8_PREFIX, raw]),
		format: 'der',
		type: 'pkcs8'
	});
}

export function rawPublicKey(key: KeyObject): Buffer {
	return key.export({ format: 'der', type: 'spki' }).subarray(X25519_SPKI_PREFIX.length);
}

export function generateKeyPair(): { privateKey: KeyObject; publicKey: Buffer } {
	const { privateKey, publicKey } = generateKeyPairSync('x25519');
	return { privateKey, publicKey: rawPublicKey(publicKey) };
}

export function deriveKeys(
	privateKey: KeyObject,
	peerPublicRaw: Buffer,
	clientNonce: Buffer,
	serverNonce: Buffer,
	sessionId: string
): SessionKeys {
	let shared: Buffer;
	try {
		shared = diffieHellman({ privateKey, publicKey: x25519PublicFromRaw(peerPublicRaw) });
	} catch (cause) {
		// Node refuses a low-order point here. Accepting one would mean
		// deriving a key the attacker already knows.
		throw new Owe1Error('low order point', { cause });
	}

	if (shared.every((byte) => byte === 0)) {
		throw new Owe1Error('low order point');
	}

	const salt = Buffer.concat([clientNonce, serverNonce]);
	const expand = (info: string) =>
		Buffer.from(hkdfSync('sha256', shared, salt, Buffer.from(info), 32));

	return {
		clientToServer: expand(INFO_C2S + sessionId),
		serverToClient: expand(INFO_S2C + sessionId)
	};
}

/** Every binary part is fixed size and the session id has a fixed shape, so
 * the concatenation is unambiguous without length prefixes. */
export function transcript(
	clientPublic: Buffer,
	serverPublic: Buffer,
	clientNonce: Buffer,
	serverNonce: Buffer,
	sessionId: string,
	expiresAt: number,
	serverTime: number
): Buffer {
	return Buffer.concat([
		TRANSCRIPT_LABEL,
		clientPublic,
		serverPublic,
		clientNonce,
		serverNonce,
		Buffer.from(sessionId),
		Buffer.from('|'),
		Buffer.from(String(expiresAt)),
		Buffer.from('|'),
		Buffer.from(String(serverTime))
	]);
}

export function keyId(publicKey: Buffer): string {
	return `k-${createHash('sha256').update(publicKey).digest('base64url').slice(0, 12)}`;
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Verify or throw. A client that cannot verify stops; it never falls back to
 * plaintext (docs/api/encryption.md#handshake). */
export function verifyHandshake(
	pinnedPublicKeyRaw: Buffer,
	signature: Buffer,
	body: Buffer
): void {
	const key = createPublicKey({
		key: Buffer.concat([ED25519_SPKI_PREFIX, pinnedPublicKeyRaw]),
		format: 'der',
		type: 'spki'
	});

	if (!verify(null, body, key, signature)) {
		throw new Owe1Error('handshake signature did not verify');
	}
}

// ------------------------------------------------------------ seal and open

/** A fresh random nonce per message unless one is supplied, which only the
 * vector tests do. */
export function seal(key: Buffer, aad: Buffer, plaintext: Buffer, nonce?: Buffer): SealedBody {
	const iv = nonce ?? randomBytes(NONCE_LEN);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(aad);

	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	// The tag travels appended to the ciphertext, as AEAD implementations in
	// Rust and Python both expect.
	return { n: b64(iv), c: b64(Buffer.concat([ciphertext, cipher.getAuthTag()])) };
}

export function open(key: Buffer, aad: Buffer, body: SealedBody): Buffer {
	const iv = unb64(body.n);
	if (iv.length !== NONCE_LEN) {
		throw new Owe1Error('malformed nonce');
	}

	const payload = unb64(body.c);
	if (payload.length < 16) {
		throw new Owe1Error('ciphertext too short to carry a tag');
	}

	const tag = payload.subarray(payload.length - 16);
	const ciphertext = payload.subarray(0, payload.length - 16);

	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAAD(aad);
	decipher.setAuthTag(tag);

	try {
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	} catch (cause) {
		throw new Owe1Error('decryption failed', { cause });
	}
}

/** Header-carried fields travel as `nonce.ciphertext`. */
export function sealField(key: Buffer, aad: Buffer, plaintext: Buffer): string {
	const body = seal(key, aad, plaintext);
	return `${body.n}.${body.c}`;
}

export function openField(key: Buffer, aad: Buffer, value: string): Buffer {
	if (value === '') return Buffer.alloc(0);

	const separator = value.indexOf('.');
	if (separator === -1) {
		throw new Owe1Error('malformed field');
	}

	return open(key, aad, {
		n: value.slice(0, separator),
		c: value.slice(separator + 1)
	});
}

export function nowSecs(): number {
	return Math.floor(Date.now() / 1000);
}
