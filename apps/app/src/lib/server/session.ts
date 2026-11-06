/**
 * The session cookies.
 *
 * Set here and nowhere else, and never by client JavaScript (D5, AUTH-3).
 * Two cookies: a short access JWT and a long rotating refresh token.
 * See docs/security/auth.md#the-session-cookies.
 */

import type { Cookies } from '@sveltejs/kit';


export type IssuedSession = {
	access_token: string;
	access_expires_at: number;
	refresh_token: string;
	refresh_expires_at: number;
	user_id: string;
	/** Null while the user has no workspace (D109). */
	workspace_id: string | null;
	role: 'owner' | 'admin' | 'member' | null;
};

const secure = process.env.APP_ENV === 'production';

/*
 * `__Host-` in production: the browser then refuses the cookie unless it is
 * Secure, on path `/` and without a Domain, so no other subdomain can set
 * or shadow it. It also keeps these names apart from oewang old's
 * `oewang-session`, which browsers that used the old app still send and
 * whose token this API cannot verify. Development runs over plain http,
 * where a `__Host-` cookie would be refused.
 */
const prefix = secure ? '__Host-' : '';
export const ACCESS_COOKIE = `${prefix}oewang-session`;
export const REFRESH_COOKIE = `${prefix}oewang-refresh`;

function base(maxAge: number) {
	return {
		path: '/',
		httpOnly: true,
		// Lax, not Strict: a password reset link arrives from an email client
		// and must land on a usable page.
		sameSite: 'lax' as const,
		secure,
		maxAge
	};
}

export function setSession(cookies: Cookies, session: IssuedSession): void {
	const now = Math.floor(Date.now() / 1000);

	cookies.set(ACCESS_COOKIE, session.access_token, base(session.access_expires_at - now));
	cookies.set(REFRESH_COOKIE, session.refresh_token, base(session.refresh_expires_at - now));
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(ACCESS_COOKIE, { path: '/' });
	cookies.delete(REFRESH_COOKIE, { path: '/' });
}

export function readAccessToken(cookies: Cookies): string | undefined {
	return cookies.get(ACCESS_COOKIE);
}

export function readRefreshToken(cookies: Cookies): string | undefined {
	return cookies.get(REFRESH_COOKIE);
}

/**
 * Whether an access token names a workspace (D109).
 *
 * Read, not verified: it only decides which page to show. The API checks
 * the signature on every call and refuses workspace data to a session
 * without one, whatever this answers. A token that cannot be read counts
 * as having one, so the API is the one to refuse it.
 */
export function tokenHasWorkspace(token: string): boolean {
	try {
		const payload = token.split('.')[1] ?? '';
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		return typeof claims?.wid === 'string' && claims.wid !== '';
	} catch {
		return true;
	}
}
