import type { Cookies } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setSession, tokenHasWorkspace, type IssuedSession } from './session';

/** What `cookies.set` was called with, in order. */
function recorder() {
	const set: { name: string; value: string; options: Record<string, unknown> }[] = [];
	const cookies = {
		set: (name: string, value: string, options: Record<string, unknown>) =>
			set.push({ name, value, options })
	} as unknown as Cookies;
	return { cookies, set };
}

/** A session issued now under the API's default lifetimes (AUTH-7). */
function issued(): IssuedSession {
	const now = Math.floor(Date.now() / 1000);
	return {
		access_token: 'access.jwt',
		access_expires_at: now + 15 * 60,
		refresh_token: 'refresh-raw',
		refresh_expires_at: now + 30 * 24 * 60 * 60,
		user_id: 'u',
		workspace_id: 'w',
		role: 'owner'
	};
}

// AUTH-7
describe('setSession', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('should keep both tokens in httpOnly cookies that end with the tokens, the access one 30 seconds early', () => {
		vi.useFakeTimers({ now: new Date('2026-11-23T00:00:00Z') });
		const { cookies, set } = recorder();

		setSession(cookies, issued());
		vi.useRealTimers();

		expect(set.map((cookie) => [cookie.name, cookie.value])).toEqual([
			['oewang-session', 'access.jwt'],
			['oewang-refresh', 'refresh-raw']
		]);
		for (const { options } of set) {
			expect(options).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax' });
		}
		expect(set[0].options.maxAge).toBe(15 * 60 - 30);
		expect(set[1].options.maxAge).toBe(30 * 24 * 60 * 60);
	});

	// Only an explicit `development` drops Secure; unset is production.
	it.each(['production', undefined])(
		'should mark both cookies Secure and __Host- when APP_ENV is %s',
		async (appEnv) => {
			vi.stubEnv('APP_ENV', appEnv);
			vi.resetModules();
			const production = await import('./session');
			const { cookies, set } = recorder();

			production.setSession(cookies, issued());

			expect(set.map((cookie) => cookie.name)).toEqual([
				'__Host-oewang-session',
				'__Host-oewang-refresh'
			]);
			for (const { options } of set) {
				expect(options).toMatchObject({ httpOnly: true, secure: true, path: '/' });
			}
		}
	);
});

/** A token with these claims. The signature is never read here. */
function token(claims: Record<string, unknown>): string {
	const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`;
}

describe('tokenHasWorkspace', () => {
	it('should see the workspace a token is scoped to', () => {
		expect(tokenHasWorkspace(token({ sub: 'u', wid: 'w', role: 'owner' }))).toBe(true);
	});

	// WS-7
	it('should see a session opened before the user had a workspace (D109)', () => {
		expect(tokenHasWorkspace(token({ sub: 'u' }))).toBe(false);
	});

	it('should leave an unreadable token for the API to refuse', () => {
		expect(tokenHasWorkspace('not-a-token')).toBe(true);
		expect(tokenHasWorkspace('a.%%%.c')).toBe(true);
	});
});
