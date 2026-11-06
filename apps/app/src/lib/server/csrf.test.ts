import { describe, expect, it } from 'vitest';

import { isCrossSiteForm } from './csrf';

const site = new URL('https://app.oewang.com/settings/members?/invite');

function post(origin: string | null, type: string | null, url = site) {
	const headers = new Headers();
	if (origin) headers.set('origin', origin);
	if (type) headers.set('content-type', type);
	return isCrossSiteForm(new Request(url, { method: 'POST', headers }), url);
}

describe('the cross-site form check', () => {
	it('refuses a form from another site or from no site, as SvelteKit did', () => {
		expect(post('https://evil.example', 'application/x-www-form-urlencoded')).toBe(true);
		expect(post(null, 'multipart/form-data')).toBe(true);
		expect(post('https://evil.example', null)).toBe(true);
	});

	it('lets this site post, and leaves JSON alone', () => {
		expect(post('https://app.oewang.com', 'application/x-www-form-urlencoded')).toBe(false);
		expect(post('https://evil.example', 'application/json')).toBe(false);
	});

	it('exempts only the exact token endpoint', () => {
		const token = new URL('https://app.oewang.com/oauth/token');
		expect(post(null, 'application/x-www-form-urlencoded', token)).toBe(false);
		const near = new URL('https://app.oewang.com/oauth/token/x');
		expect(post(null, 'application/x-www-form-urlencoded', near)).toBe(true);
		const authorize = new URL('https://app.oewang.com/oauth/authorize?/allow');
		expect(post('https://evil.example', 'application/x-www-form-urlencoded', authorize)).toBe(true);
	});
});
