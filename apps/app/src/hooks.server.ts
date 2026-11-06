/**
 * The auth guard.
 *
 * Verification happens twice on purpose. Here, so an unauthenticated visitor
 * is redirected without a round trip; and again in the API, which trusts
 * nothing this layer decides. See docs/security/auth.md#request-flow.
 */

import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';

import { dev } from '$app/env';

import { api, ApiError } from '$lib/server/api';
import { securityHeaders } from '$lib/security-headers';
import {
	clearSession,
	readAccessToken,
	readRefreshToken,
	setSession,
	type IssuedSession
} from '$lib/server/session';

/** Routes a signed-out visitor may see. Everything else needs a session. */
const PUBLIC_PREFIXES = [
	'/login',
	'/register',
	'/forgot-password',
	'/reset-password',
	// The design system renders primitives and reads no data. Its own load
	// returns 404 outside development.
	'/design-system',
	// Liveness, for the container health check. A health check that has to
	// log in is not one, and this route reads nothing.
	'/health',
	// MCP clients bring their own bearer token, checked by the API (D106).
	'/mcp'
];

function isPublic(pathname: string): boolean {
	return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const handle: Handle = async ({ event, resolve }) => {
	const { cookies, url } = event;
	let accessToken = readAccessToken(cookies);

	// The access token lasts fifteen minutes, so an ordinary session spends
	// most of its life here: refresh transparently rather than bouncing the
	// user to a login form every quarter of an hour.
	if (!accessToken) {
		const refreshToken = readRefreshToken(cookies);
		if (refreshToken) {
			try {
				const result = await api<IssuedSession>({
					method: 'POST',
					path: '/v1/auth/refresh',
					body: { refresh_token: refreshToken }
				});
				if (result.data) {
					setSession(cookies, result.data);
					accessToken = result.data.access_token;
				}
			} catch (error) {
				// A refused refresh means revoked, expired or reused. All three
				// end the same way: sign in again.
				if (error instanceof ApiError) {
					clearSession(cookies);
				} else {
					throw error;
				}
			}
		}
	}

	event.locals.accessToken = accessToken;

	if (!accessToken && !isPublic(url.pathname)) {
		// Carry where they were going, so signing in lands them there.
		const target = url.pathname + url.search;
		redirect(303, `/login?next=${encodeURIComponent(target)}`);
	}

	if (accessToken && (url.pathname === '/login' || url.pathname === '/register')) {
		redirect(303, '/');
	}

	const response = await resolve(event);

	// The Content-Security-Policy is issued by SvelteKit itself, configured
	// in vite.config.ts, because only it can nonce its own inline bootstrap
	// script. Setting it here instead blocks that script and the app stops
	// hydrating without any visible error (SEC-15).
	//
	// The rest are plain headers with nothing for SvelteKit to sign. Their
	// values live in $lib/security-headers beside the CSP directives, so
	// one file answers what this app sends and one test snapshots it.
	for (const [name, value] of Object.entries(securityHeaders(!dev))) {
		response.headers.set(name, value);
	}

	return response;
};
