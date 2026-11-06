import { describe, expect, it } from 'vitest';

import { tokenHasWorkspace } from './session';

/** A token with these claims. The signature is never read here. */
function token(claims: Record<string, unknown>): string {
	const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`;
}

describe('tokenHasWorkspace', () => {
	it('should see the workspace a token is scoped to', () => {
		expect(tokenHasWorkspace(token({ sub: 'u', wid: 'w', role: 'owner' }))).toBe(true);
	});

	it('should see a session opened before the user had a workspace (D109)', () => {
		expect(tokenHasWorkspace(token({ sub: 'u' }))).toBe(false);
	});

	it('should leave an unreadable token for the API to refuse', () => {
		expect(tokenHasWorkspace('not-a-token')).toBe(true);
		expect(tokenHasWorkspace('a.%%%.c')).toBe(true);
	});
});
