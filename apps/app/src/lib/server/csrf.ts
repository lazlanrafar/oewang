/**
 * The cross-site form check, owned here instead of by SvelteKit (D106).
 *
 * SvelteKit refuses a form-encoded POST, PUT, PATCH or DELETE whose
 * `Origin` is not this site's, and SvelteKit 3 refuses one with no
 * `Origin` at all. That is right for every page, and wrong for exactly one
 * route: the OAuth token endpoint, which RFC 6749 requires to be
 * form-encoded and which apps such as Claude Code call from outside any
 * browser, with no `Origin`. SvelteKit's check cannot exempt a path, so it
 * is switched off in vite.config.ts and this one, the same rule, runs
 * first in hooks.server.ts with that one path exempt. The token endpoint
 * needs no CSRF protection: it reads no cookie, and a code is useless
 * without the PKCE verifier only the app holds.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

/** Routes apps call without a browser. Exact paths, never prefixes. */
const EXEMPT = new Set(['/oauth/token']);

export function isCrossSiteForm(request: Request, url: URL): boolean {
	if (!MUTATING.has(request.method) || EXEMPT.has(url.pathname)) return false;

	const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
	const isForm = !type || FORM_TYPES.includes(type);
	return isForm && request.headers.get('origin') !== url.origin;
}
