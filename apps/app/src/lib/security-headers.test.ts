import { describe, expect, it } from 'vitest';

import { CSP_DIRECTIVES, HSTS_VALUE, securityHeaders, serializeCsp } from './security-headers';

/**
 * The snapshot (SEC-15).
 *
 * Written out rather than matched loosely, because the point is that
 * widening a directive fails here and shows up in the diff as the security
 * change it is. Updating this file should feel like a decision.
 *
 * The source of truth is docs/security/hardening.md#browser-headers. If a
 * line here and a line there disagree, one of them is a bug.
 */
describe('the content security policy', () => {
	it('is exactly this', () => {
		expect(serializeCsp(CSP_DIRECTIVES)).toBe(
			"default-src 'self'; " +
				"script-src 'self'; " +
				"style-src 'self'; " +
				"style-src-attr 'unsafe-inline'; " +
				"img-src 'self' data: blob:; " +
				"connect-src 'self'; " +
				"font-src 'self'; " +
				"object-src 'none'; " +
				"base-uri 'none'; " +
				"frame-ancestors 'none'; " +
				"form-action 'self'"
		);
	});

	it('never allows an inline script', () => {
		// The one control this whole policy exists for. SvelteKit adds a
		// per-response nonce to its own bootstrap, so nothing here needs
		// 'unsafe-inline' and nothing may add it.
		expect(CSP_DIRECTIVES['script-src']).not.toContain('unsafe-inline');
		expect(CSP_DIRECTIVES['script-src']).not.toContain('unsafe-eval');
		expect(CSP_DIRECTIVES['default-src']).not.toContain('unsafe-inline');
	});

	it('allows inline styles only as attributes, never as elements', () => {
		// An injected `<style>` block and a remote stylesheet stay refused;
		// only the per-element geometry attributes are allowed.
		expect(CSP_DIRECTIVES['style-src']).not.toContain('unsafe-inline');
		expect(CSP_DIRECTIVES['style-src-attr']).toEqual(['unsafe-inline']);
	});

	it('lets no page frame this app and no page be framed into it', () => {
		expect(CSP_DIRECTIVES['frame-ancestors']).toEqual(['none']);
		expect(CSP_DIRECTIVES['object-src']).toEqual(['none']);
		expect(CSP_DIRECTIVES['base-uri']).toEqual(['none']);
	});

	it('lets the browser reach this origin and nothing else', () => {
		// The browser never calls the API or the AI service (D5, PLT-4), so
		// no other origin belongs in connect-src.
		expect(CSP_DIRECTIVES['connect-src']).toEqual(['self']);
		expect(CSP_DIRECTIVES['form-action']).toEqual(['self']);
		expect(CSP_DIRECTIVES['font-src']).toEqual(['self']);
	});

	it('allows blob: images, because file bytes arrive in memory', () => {
		// Decrypted chunks are shown through a Blob URL that is revoked
		// after load. No signed object-storage URL exists (D23).
		expect(CSP_DIRECTIVES['img-src']).toEqual(['self', 'data:', 'blob:']);
	});
});

describe('the plain headers', () => {
	it('are exactly these in production', () => {
		expect(securityHeaders(true)).toEqual({
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'strict-origin-when-cross-origin',
			'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
		});
	});

	it('hold HSTS back outside production', () => {
		// Pinning a development machine to HTTPS for a year is a long time
		// to regret one page load over localhost.
		const headers = securityHeaders(false);

		expect(headers['Strict-Transport-Security']).toBeUndefined();
		expect(headers['X-Content-Type-Options']).toBe('nosniff');
	});

	it('ask for a year of HSTS, which is what a preload entry means', () => {
		expect(HSTS_VALUE).toBe('max-age=31536000; includeSubDomains');
	});

	it('grant the camera and nothing else', () => {
		// `camera=(self)` only because receipt capture on a phone uses it.
		const policy = securityHeaders(true)['Permissions-Policy'];

		expect(policy).toContain('camera=(self)');
		for (const feature of ['microphone', 'geolocation', 'payment']) {
			expect(policy).toContain(`${feature}=()`);
		}
	});
});

describe('serializeCsp', () => {
	it('quotes a keyword and leaves a scheme alone', () => {
		expect(serializeCsp({ 'img-src': ['self', 'data:', 'blob:'] })).toBe(
			"img-src 'self' data: blob:"
		);
	});
});
