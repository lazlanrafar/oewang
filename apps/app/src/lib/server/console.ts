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

import type { UserAction, WorkspaceAction } from '$lib/console';
import { api, ApiError, type Envelope } from '$lib/server/api';

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

/*
 * Users and workspaces (CSL-3, CSL-4, US-081). Metadata only: counts, bytes
 * and token totals, never an amount or a note (CSL-13).
 */

export type MemberRole = 'owner' | 'admin' | 'member';

export type ConsoleUserRow = {
	id: string;
	email: string;
	name: string | null;
	created_at: string;
	console_role: string | null;
	/** How many live workspaces this person belongs to. */
	workspaces: number;
	last_active_at: string | null;
	/** Set while an operator has disabled the account (US-082). */
	disabled_at: string | null;
};

export type ConsoleUser = ConsoleUserRow & {
	memberships: {
		workspace_id: string;
		workspace_name: string;
		role: MemberRole;
		joined_at: string;
		workspace_deleted_at: string | null;
	}[];
};

export type ConsoleWorkspaceRow = {
	id: string;
	name: string;
	slug: string;
	currency_code: string;
	created_at: string;
	deleted_at: string | null;
	/** Set while an operator has suspended the workspace (US-082). */
	suspended_at: string | null;
	members: number;
	owner_email: string | null;
	last_activity_at: string | null;
};

export type ConsoleWorkspace = ConsoleWorkspaceRow & {
	member_list: { user_id: string; email: string; name: string | null; role: MemberRole; joined_at: string }[];
	counts: { wallets: number; transactions: number };
	storage: { bytes: number; files: number };
	tokens_month: { input: number; output: number };
};

/** A console read; a missing permission is the 403 page, as `readConsoleMe` has it. */
async function consoleRead<T>(path: string, token: string | undefined, query?: URLSearchParams) {
	try {
		return await api<T>({ path, query, token });
	} catch (caught) {
		if (caught instanceof ApiError && caught.code === 'CONSOLE_FORBIDDEN') {
			error(403, 'CONSOLE_FORBIDDEN');
		}
		throw caught;
	}
}

/** One record for a sheet; null when the id names nothing, so the sheet stays shut. */
async function consoleRecord<T>(path: string, token: string | undefined): Promise<T | null> {
	try {
		return (await consoleRead<T>(path, token)).data;
	} catch (caught) {
		if (caught instanceof ApiError && caught.status === 404) return null;
		throw caught;
	}
}

/** `search`, `sort`, `order`, `page` and `per_page`, passed straight through. */
export function listConsoleUsers(query: URLSearchParams, token?: string): Promise<Envelope<ConsoleUserRow[]>> {
	return consoleRead('/v1/console/users', token, query);
}

export function consoleUser(id: string, token?: string): Promise<ConsoleUser | null> {
	return consoleRecord(`/v1/console/users/${encodeURIComponent(id)}`, token);
}

/** As the user list, plus `status` (`active`, `suspended` or `deleted`; absent is all). */
export function listConsoleWorkspaces(
	query: URLSearchParams,
	token?: string
): Promise<Envelope<ConsoleWorkspaceRow[]>> {
	return consoleRead('/v1/console/workspaces', token, query);
}

export function consoleWorkspace(id: string, token?: string): Promise<ConsoleWorkspace | null> {
	return consoleRecord(`/v1/console/workspaces/${encodeURIComponent(id)}`, token);
}

/*
 * Suspend, restore, disable (CSL-5 to CSL-7, US-082). Each answers the
 * updated row, and repeating one is a no-op. Errors reach the form action
 * as `ApiError`s, so the page can say them in a toast.
 */

export function actOnWorkspace(id: string, action: WorkspaceAction, token?: string) {
	return api<ConsoleWorkspaceRow>({
		method: 'POST',
		path: `/v1/console/workspaces/${encodeURIComponent(id)}/${action}`,
		token
	});
}

export function actOnUser(id: string, action: UserAction, token?: string) {
	return api<ConsoleUserRow>({
		method: 'POST',
		path: `/v1/console/users/${encodeURIComponent(id)}/${action}`,
		token
	});
}
