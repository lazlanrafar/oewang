/**
 * The operator console's host gate (CSL-1, D124).
 *
 * The console is this app reached on its own host. That host serves only the
 * console and its sign-in, and no other host serves the console, so an
 * operator's session never lives on the host every user's browser talks to.
 * See docs/features/console.md#the-host.
 */

import { createPublicKey, verify } from 'node:crypto';

import { error } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';

/** Unset means there is no console on any host. */
function consoleHost(): string | undefined {
	return process.env.CONSOLE_HOST || undefined;
}

export function isConsoleHost(host: string): boolean {
	return host === consoleHost();
}

/** Paths both hosts serve: signing in and out, and the health check. */
const SHARED = ['/login', '/logout', '/health'];

function isConsolePath(pathname: string): boolean {
	return pathname === '/console' || pathname.startsWith('/console/');
}

/** Whether this host serves this path at all; a refusal is a 404. */
export function hostServes(onConsole: boolean, pathname: string): boolean {
	if (SHARED.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
	// SvelteKit's own client files, when the server is asked for them.
	if (pathname.startsWith('/_app/')) return true;
	return onConsole === isConsolePath(pathname);
}

/*
 * Cloudflare Access (D124). Access admits only the emails on its policy and
 * then signs every request it lets through. Checking that signature here
 * means a request sent straight to the origin, around Cloudflare, is
 * refused rather than trusted.
 */

type AccessKeys = { keys: Map<string, ReturnType<typeof createPublicKey>>; fetchedAt: number };

let cached: AccessKeys | null = null;
const KEYS_TTL_MS = 60 * 60 * 1000;
/** A token naming a key we do not have refetches, at most this often. */
const REFETCH_FLOOR_MS = 60 * 1000;

async function accessKeys(team: string, unknownKid: boolean): Promise<AccessKeys['keys']> {
	const now = Date.now();
	const stale = !cached || now - cached.fetchedAt > KEYS_TTL_MS;
	const rotated = unknownKid && cached && now - cached.fetchedAt > REFETCH_FLOOR_MS;
	if (stale || rotated) {
		const response = await fetch(`https://${team}/cdn-cgi/access/certs`);
		if (!response.ok) throw new Error(`cloudflare access keys: ${response.status}`);
		const body: { keys: (JsonWebKey & { kid: string })[] } = await response.json();
		cached = {
			keys: new Map(body.keys.map((jwk) => [jwk.kid, createPublicKey({ key: jwk, format: 'jwk' })])),
			fetchedAt: now
		};
	}
	return cached!.keys;
}

function decodePart<T>(part: string): T {
	return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * True when the request carries a valid Access token for this application.
 * Skipped in development, where nothing stands in front of the app; in any
 * other environment a missing configuration refuses rather than opens.
 */
export async function accessAllowed(headers: Headers): Promise<boolean> {
	if (process.env.APP_ENV === 'development') return true;

	const team = process.env.CF_ACCESS_TEAM_DOMAIN;
	const audience = process.env.CF_ACCESS_AUD;
	const token = headers.get('cf-access-jwt-assertion');
	if (!team || !audience || !token) return false;

	try {
		const [rawHeader, rawPayload, rawSignature] = token.split('.');
		if (!rawHeader || !rawPayload || !rawSignature) return false;
		const header = decodePart<{ alg?: string; kid?: string }>(rawHeader);
		if (header.alg !== 'RS256' || !header.kid) return false;

		let keys = await accessKeys(team, false);
		if (!keys.has(header.kid)) keys = await accessKeys(team, true);
		const key = keys.get(header.kid);
		if (!key) return false;

		const signed = verify(
			'sha256',
			Buffer.from(`${rawHeader}.${rawPayload}`),
			key,
			Buffer.from(rawSignature, 'base64url')
		);
		if (!signed) return false;

		const claims = decodePart<{ aud?: string | string[]; exp?: number; iss?: string }>(rawPayload);
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		return (
			audiences.includes(audience) &&
			claims.iss === `https://${team}` &&
			typeof claims.exp === 'number' &&
			claims.exp > Date.now() / 1000
		);
	} catch {
		return false;
	}
}

/** For tests: forget the fetched keys. */
export function resetAccessKeys() {
	cached = null;
}

export type ConsoleMe = {
	id: string;
	email: string;
	name: string | null;
	role: { id: string; name: string };
	permissions: string[];
};

/** The operator and their permissions; 403 for a person without a role. */
export async function readConsoleMe(token: string | undefined): Promise<ConsoleMe> {
	try {
		return (await api<ConsoleMe>({ path: '/v1/console/me', token })).data!;
	} catch (caught) {
		if (caught instanceof ApiError && caught.code === 'CONSOLE_FORBIDDEN') {
			error(403, 'CONSOLE_FORBIDDEN');
		}
		throw caught;
	}
}
