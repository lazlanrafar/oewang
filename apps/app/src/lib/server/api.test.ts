/**
 * The rule that decides whether an unsealed answer may be read.
 *
 * Pulled out of the request path so it can be tested without a socket: the
 * rest of `api.ts` needs a live handshake, and this is the part that would
 * be expensive to get wrong.
 */
import { describe, expect, it } from 'vitest';

import { clientHeaders, plaintextAllowed } from './api';

describe('plaintextAllowed', () => {
	it('refuses an unsealed answer while encryption is on', () => {
		// An intermediary that strips the sealing and hands back its own
		// JSON would otherwise be believed.
		expect(plaintextAllowed(true, false)).toBe(false);
	});

	it('allows the transport error the API marked', () => {
		// Marked precisely because the caller may hold no working key, which
		// is the whole reason it is an error.
		expect(plaintextAllowed(true, true)).toBe(true);
	});

	it('allows plaintext with encryption off, which only development may do', () => {
		expect(plaintextAllowed(false, false)).toBe(true);
	});
});

describe('clientHeaders', () => {
	it('relays the browser, not this server, to the session list', () => {
		expect(clientHeaders('Mozilla/5.0 (Macintosh)', '203.0.113.7', null)).toEqual({
			'x-client-user-agent': 'Mozilla/5.0 (Macintosh)',
			'x-client-ip': '203.0.113.7'
		});
	});

	it('vouches for the address with the relay key, so the API limits each browser', () => {
		expect(clientHeaders(null, '203.0.113.7', 'k'.repeat(32))).toEqual({
			'x-client-ip': '203.0.113.7',
			'x-relay-key': 'k'.repeat(32)
		});
		// No address, nothing to vouch for: the key is not sent on its own.
		expect(clientHeaders(null, null, 'k'.repeat(32))).toEqual({});
	});

	it('sends nothing it does not know', () => {
		expect(clientHeaders(null, null)).toEqual({});
		expect(clientHeaders('', '')).toEqual({});
	});
});
