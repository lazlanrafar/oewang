import { describe, expect, it } from 'vitest';

import { passkeySignInError } from './passkeys';

describe('passkeySignInError', () => {
	// AUTH-14: no email was typed, so the refusal must not mention one.
	it('should speak of the passkey when the API refuses it', () => {
		expect(passkeySignInError('INVALID_CREDENTIALS')).toBe(
			'That passkey did not sign you in. Try again, or use your password.'
		);
		expect(passkeySignInError(null)).toBe(
			'That passkey did not sign you in. Try again, or use your password.'
		);
	});

	it('should keep any other code its own message', () => {
		expect(passkeySignInError('RATE_LIMITED')).not.toMatch(/passkey did not sign you in/);
	});
});
