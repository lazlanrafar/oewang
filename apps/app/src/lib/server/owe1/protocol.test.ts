/**
 * Run the shared OWE1 vectors.
 *
 * The same file is run by the Rust implementation that generated it and by
 * the Python client in apps/ai. If any of the three changes its bytes, this
 * fails.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as owe1 from './protocol';

function vectorsPath(): string {
	// Mounted read-only in the container, repo-relative when run natively.
	const fromEnv = process.env.OWE1_VECTORS_PATH;
	if (fromEnv) return fromEnv;

	let dir = process.cwd();
	for (;;) {
		const candidate = join(dir, 'apps/api/crates/domain/testdata/owe1-vectors.json');
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error('shared OWE1 vectors not found; set OWE1_VECTORS_PATH');
}

type Vectors = {
	inputs: Record<string, string | number>;
	derived: Record<string, string>;
	messages: Record<string, { aad: string; plaintext: string; sealed: owe1.SealedBody }>;
};

const vectors: Vectors = JSON.parse(readFileSync(resolve(vectorsPath()), 'utf8'));
const inputs = vectors.inputs as Record<string, string> & { timestamp: number; expires_at: number };

const clientPrivate = owe1.x25519PrivateFromRaw(owe1.unb64(inputs.client_secret));
const keys = owe1.deriveKeys(
	clientPrivate,
	owe1.unb64(inputs.server_public_key),
	owe1.unb64(inputs.client_nonce),
	owe1.unb64(inputs.server_nonce),
	inputs.session_id
);

describe('OWE1 shared vectors', () => {
	it('derives the same keys as the Rust implementation', () => {
		expect(owe1.b64(keys.clientToServer)).toBe(vectors.derived.k_c2s);
		expect(owe1.b64(keys.serverToClient)).toBe(vectors.derived.k_s2c);
	});

	it('builds the same transcript', () => {
		const built = owe1.transcript(
			owe1.unb64(inputs.client_public_key),
			owe1.unb64(inputs.server_public_key),
			owe1.unb64(inputs.client_nonce),
			owe1.unb64(inputs.server_nonce),
			inputs.session_id,
			inputs.expires_at,
			inputs.timestamp
		);
		expect(owe1.b64(built)).toBe(vectors.derived.transcript);
	});

	it('derives the same key id', () => {
		expect(owe1.keyId(owe1.unb64(inputs.server_public_key))).toBe(
			vectors.derived.key_id_of_server_public
		);
	});

	it('builds the same associated data', () => {
		const { session_id: s, request_id: r, timestamp: t } = inputs;
		expect(owe1.aadRequest(s, 'POST', '/v1/transactions', r, t).toString()).toBe(
			vectors.messages.request.aad
		);
		expect(owe1.aadQuery(s, 'GET', '/v1/transactions', r, t).toString()).toBe(
			vectors.messages.query.aad
		);
		expect(owe1.aadResponse(s, r, 201).toString()).toBe(vectors.messages.response.aad);
		expect(owe1.aadStreamEvent(s, r, 0).toString()).toBe(vectors.messages.stream_event.aad);
	});

	it.each([
		['request', 'clientToServer'],
		['query', 'clientToServer'],
		['response', 'serverToClient'],
		['stream_event', 'serverToClient']
	] as const)('opens the %s vector', (name, direction) => {
		const message = vectors.messages[name];
		const opened = owe1.open(keys[direction], Buffer.from(message.aad), message.sealed);
		expect(opened.toString()).toBe(message.plaintext);
	});

	it.each([
		['request', 'clientToServer'],
		['response', 'serverToClient']
	] as const)(
		'reproduces the exact %s ciphertext with the fixed nonce',
		(name, direction) => {
			// Opening proves compatibility; reproducing proves the encoding
			// matches byte for byte, which is what catches a subtle base64 or
			// tag-placement difference.
			const message = vectors.messages[name];
			const sealed = owe1.seal(
				keys[direction],
				Buffer.from(message.aad),
				Buffer.from(message.plaintext),
				owe1.unb64(inputs.seal_nonce)
			);
			expect(sealed).toEqual(message.sealed);
		}
	);
});

describe('OWE1 refusals', () => {
	it('rejects a tampered ciphertext', () => {
		const message = vectors.messages.response;
		const sealed = { ...message.sealed };
		sealed.c = (sealed.c[0] === 'A' ? 'B' : 'A') + sealed.c.slice(1);

		expect(() => owe1.open(keys.serverToClient, Buffer.from(message.aad), sealed)).toThrow(
			owe1.Owe1Error
		);
	});

	it('rejects a message bound to another status', () => {
		const message = vectors.messages.response;
		const swapped = owe1.aadResponse(inputs.session_id, inputs.request_id, 200);
		expect(() => owe1.open(keys.serverToClient, swapped, message.sealed)).toThrow(owe1.Owe1Error);
	});

	it('rejects a low order public key', () => {
		const { privateKey } = owe1.generateKeyPair();
		expect(() =>
			owe1.deriveKeys(privateKey, Buffer.alloc(32), Buffer.alloc(16), Buffer.alloc(16), 'cs_a')
		).toThrow(owe1.Owe1Error);
	});

	it('rejects a malformed nonce', () => {
		expect(() =>
			owe1.open(keys.serverToClient, Buffer.from('aad'), { n: owe1.b64(Buffer.alloc(5)), c: 'AAAA' })
		).toThrow(owe1.Owe1Error);
	});

	it('rejects a field without a separator', () => {
		expect(() => owe1.openField(keys.clientToServer, Buffer.from('aad'), 'nope')).toThrow(
			owe1.Owe1Error
		);
	});
});

describe('OWE1 round trips', () => {
	it('round trips a field, including an empty one', () => {
		const key = Buffer.alloc(32, 9);
		const aad = owe1.aadQuery('cs_a', 'GET', '/v1/transactions', 'req_1', 1);
		const field = owe1.sealField(key, aad, Buffer.from('type=expense&page=2'));

		expect(owe1.openField(key, aad, field).toString()).toBe('type=expense&page=2');
		expect(owe1.openField(key, aad, '').length).toBe(0);
	});

	it('uses a fresh nonce per message', () => {
		const key = Buffer.alloc(32, 9);
		const aad = owe1.aadResponse('cs_a', 'req_1', 200);
		const a = owe1.seal(key, aad, Buffer.from('same'));
		const b = owe1.seal(key, aad, Buffer.from('same'));

		expect(a.n).not.toBe(b.n);
		expect(a.c).not.toBe(b.c);
	});

	it('agrees with a freshly generated peer', () => {
		const alice = owe1.generateKeyPair();
		const bob = owe1.generateKeyPair();
		const nonces = [Buffer.alloc(16, 1), Buffer.alloc(16, 2)] as const;

		const fromAlice = owe1.deriveKeys(alice.privateKey, bob.publicKey, ...nonces, 'cs_x');
		const fromBob = owe1.deriveKeys(bob.privateKey, alice.publicKey, ...nonces, 'cs_x');

		expect(fromAlice).toEqual(fromBob);
	});
});
