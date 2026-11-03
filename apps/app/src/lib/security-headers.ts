/**
 * The browser headers, in one place (SEC-15, PLT-4).
 *
 * The table in docs/security/hardening.md#browser-headers is the
 * specification; this module is the only implementation of it. Two callers
 * share it, which is the point:
 *
 * - `vite.config.ts` hands `CSP_DIRECTIVES` to SvelteKit, because only
 *   SvelteKit can nonce its own inlined bootstrap script and its own
 *   `<style>` element. A hand-written `Content-Security-Policy` in a hook
 *   blocks both, and the app stops hydrating with nothing visibly broken:
 *   forms still submit, because they are real forms.
 * - `hooks.server.ts` sets the rest, which have nothing to sign.
 *
 * `security-headers.test.ts` snapshots every value. A loosened policy is
 * then a failing test and a line in a diff rather than something noticed in
 * production.
 */

/**
 * The content security policy, as SvelteKit takes it.
 *
 * SvelteKit adds `nonce-…` to `script-src` and to `style-src` itself, once
 * per response, so neither carries `'unsafe-inline'`.
 *
 * Mutable arrays, because that is the type SvelteKit's config asks for: it
 * appends the nonce to them. The snapshot test is what makes these
 * effectively constant, which is the part that matters.
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
	'default-src': ['self'],
	'script-src': ['self'],
	'style-src': ['self'],
	/**
	 * Five inline `style` attributes carry a geometry value computed per
	 * element: the upload progress bar's transform, and the transactions
	 * table's measured total width. `style-src` covers attributes as well
	 * as elements unless `style-src-attr` says otherwise, so without this
	 * the table renders at the wrong width until hydration.
	 *
	 * It is narrower than it looks. An injected `<style>` block and a
	 * remote stylesheet are both still refused; only the attribute form is
	 * allowed. And writing one takes HTML injection, which the assistant's
	 * renderer forecloses by escaping rather than parsing (SEC-11).
	 */
	'style-src-attr': ['unsafe-inline'],
	/**
	 * `blob:` because file bytes arrive decrypted in memory and are shown
	 * through a Blob URL that is revoked after load (D23).
	 */
	'img-src': ['self', 'data:', 'blob:'],
	'connect-src': ['self'],
	'font-src': ['self'],
	'object-src': ['none'],
	'base-uri': ['none'],
	/** The CSP directive is the one that counts; `X-Frame-Options` is not set. */
	'frame-ancestors': ['none'],
	'form-action': ['self']
};

/** A year, which is what makes a preload list entry meaningful. */
export const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

/**
 * Everything that is a plain header.
 *
 * `production` gates HSTS alone: pinning a development machine to HTTPS for
 * a year is a long time to regret one page load over `localhost`.
 *
 * `camera=(self)` only because receipt capture on a phone uses it. If
 * capture ever ships as a file picker instead, this drops to `()`.
 */
export function securityHeaders(production: boolean): Record<string, string> {
	return {
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
		'Cross-Origin-Opener-Policy': 'same-origin',
		...(production ? { 'Strict-Transport-Security': HSTS_VALUE } : {})
	};
}

/**
 * The policy as a browser reads it, for the snapshot test.
 *
 * SvelteKit builds the real header, so this is a rendering of the same
 * directives rather than the header itself: what it guards is that nobody
 * widened a directive, which is the part a reviewer would miss.
 */
export function serializeCsp(directives: Record<string, readonly string[]>): string {
	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.map(quote).join(' ')}`)
		.join('; ');
}

/** A keyword is quoted; a scheme such as `data:` is not. */
function quote(value: string): string {
	return value.endsWith(':') ? value : `'${value}'`;
}
