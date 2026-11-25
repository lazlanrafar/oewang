import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/api', async (original) => ({
	...(await original<typeof import('$lib/server/api')>()),
	api
}));

import { handle } from './hooks.server';
import { REFRESH_COOKIE } from '$lib/server/session';

/** A request that carries only the refresh cookie, as after fifteen idle minutes. */
function call() {
	const jar = new Map([[REFRESH_COOKIE, 'refresh-old']]);
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string) => jar.set(name, value),
		delete: (name: string) => jar.delete(name)
	};
	const event = {
		cookies,
		url: new URL('http://localhost/health'),
		request: new Request('http://localhost/health'),
		locals: {} as { accessToken?: string }
	};
	const resolve = async () => new Response('ok');
	return {
		event,
		done: (handle as (input: unknown) => Promise<Response>)({ event, resolve })
	};
}

// AUTH-7
describe('handle', () => {
	it('should rotate a refresh token once when parallel requests carry it', async () => {
		let release = (_: unknown) => {};
		api.mockReturnValue(new Promise((resolve) => (release = resolve)));
		const now = Math.floor(Date.now() / 1000);

		const first = call();
		const second = call();
		release({
			data: {
				access_token: 'access-new',
				access_expires_at: now + 900,
				refresh_token: 'refresh-new',
				refresh_expires_at: now + 86400,
				user_id: 'u',
				workspace_id: 'w',
				role: 'owner'
			}
		});
		await Promise.all([first.done, second.done]);

		expect(api).toHaveBeenCalledTimes(1);
		expect(first.event.locals.accessToken).toBe('access-new');
		expect(second.event.locals.accessToken).toBe('access-new');
		expect(second.event.cookies.get(REFRESH_COOKIE)).toBe('refresh-new');
	});
});
