/**
 * The rule that decides whether an unsealed answer may be read.
 *
 * Pulled out of the request path so it can be tested without a socket: the
 * rest of `api.ts` needs a live handshake, and this is the part that would
 * be expensive to get wrong.
 */
import { describe, expect, it } from 'vitest';

import { plaintextAllowed } from './api';

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
