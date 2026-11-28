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
	/** The plan it holds (PLN-2). */
	plan_id: string;
	plan_name: string;
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

/*
 * The feedback inbox (CSL-8, US-083). A member's own words, which an
 * operator reads to act on them; the note is the operators' own.
 */

export type ConsoleFeedback = {
	id: string;
	type: 'bug' | 'feature' | 'other';
	message: string;
	status: 'open' | 'done';
	operator_note: string | null;
	created_at: string;
	resolved_at: string | null;
	user_id: string;
	user_email: string;
	workspace_id: string;
	workspace_name: string;
};

export type FeedbackPatch = { status?: ConsoleFeedback['status']; operator_note?: string | null };

/** `search`, `status`, `type`, `page` and `per_page`, passed straight through. Newest first. */
export function listConsoleFeedback(
	query: URLSearchParams,
	token?: string
): Promise<Envelope<ConsoleFeedback[]>> {
	return consoleRead('/v1/console/feedback', token, query);
}

/** One item for the sheet; null when the id names nothing. */
export function consoleFeedbackItem(id: string, token?: string): Promise<ConsoleFeedback | null> {
	return consoleRecord(`/v1/console/feedback/${encodeURIComponent(id)}`, token);
}

/** Needs `console.feedback.write`; answers the updated row. */
export function updateConsoleFeedback(id: string, body: FeedbackPatch, token?: string) {
	return api<ConsoleFeedback>({
		method: 'PATCH',
		path: `/v1/console/feedback/${encodeURIComponent(id)}`,
		body,
		token
	});
}

/*
 * Overview, usage and health (CSL-9 to CSL-11, US-084). Counts and token
 * totals only: plain numbers, never money.
 */

export type TokenPair = { input: number; output: number };

export type ConsoleOverview = {
	users: { total: number; new_7d: number };
	workspaces: { total: number; active: number; suspended: number; deleted: number };
	feedback_open: number;
	tokens_month: TokenPair;
	/** Twelve weeks, oldest first, empty weeks as 0. */
	signups_by_week: { week_start: string; count: number }[];
};

export type UsageRow = TokenPair & { calls: number };

export type ConsoleUsage = {
	month: string;
	totals: UsageRow;
	/** The top 50 by input plus output. */
	by_workspace: (UsageRow & { workspace_id: string; workspace_name: string })[];
	by_model: (UsageRow & { model: string | null })[];
	by_feature: (UsageRow & { feature: string })[];
};

export type ConsoleHealth = {
	receipt_jobs: { pending: number; failed_24h: number; failed_7d: number };
	/** Fourteen days, oldest first, empty days as 0. */
	ai_calls_by_day: (UsageRow & { day: string })[];
};

export async function consoleOverview(token?: string): Promise<ConsoleOverview> {
	return (await consoleRead<ConsoleOverview>('/v1/console/overview', token)).data!;
}

/** `month` is `YYYY-MM`; absent, the API's current month (UTC). */
export async function consoleUsage(month: string | null, token?: string): Promise<ConsoleUsage> {
	const query = month ? new URLSearchParams({ month }) : undefined;
	return (await consoleRead<ConsoleUsage>('/v1/console/usage', token, query)).data!;
}

export async function consoleHealth(token?: string): Promise<ConsoleHealth> {
	return (await consoleRead<ConsoleHealth>('/v1/console/health', token)).data!;
}

/*
 * Roles, operators and the operator audit (CSL-2, CSL-12, US-085). An
 * operator can only hand out what they hold themselves; the API enforces
 * it and answers CONSOLE_FORBIDDEN otherwise.
 */

export type ConsoleRole = {
	id: string;
	name: string;
	description: string | null;
	is_system: boolean;
	permissions: string[];
	/** How many operators hold it. */
	operators: number;
	created_at: string;
};

export type ConsoleRoleBody = { name?: string; description?: string | null; permissions?: string[] };

export type ConsoleOperator = {
	user_id: string;
	email: string;
	name: string | null;
	role_id: string;
	role_name: string;
	last_active_at: string | null;
};

export type ConsoleAuditEntry = {
	id: string;
	operator_id: string;
	operator_email: string;
	action: string;
	entity: string;
	entity_id: string;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	created_at: string;
};

/** Every role, the system role first. */
export async function listConsoleRoles(token?: string): Promise<ConsoleRole[]> {
	return (await consoleRead<ConsoleRole[]>('/v1/console/roles', token)).data ?? [];
}

export function createConsoleRole(body: ConsoleRoleBody, token?: string) {
	return api<ConsoleRole>({ method: 'POST', path: '/v1/console/roles', body, token });
}

/** `permissions`, when sent, replaces the whole set. */
export function updateConsoleRole(id: string, body: ConsoleRoleBody, token?: string) {
	return api<ConsoleRole>({ method: 'PATCH', path: `/v1/console/roles/${encodeURIComponent(id)}`, body, token });
}

/** 409 CONSOLE_ROLE_IN_USE while anyone holds it. */
export function deleteConsoleRole(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/console/roles/${encodeURIComponent(id)}`, token });
}

export async function listConsoleOperators(token?: string): Promise<ConsoleOperator[]> {
	return (await consoleRead<ConsoleOperator[]>('/v1/console/operators', token)).data ?? [];
}

/** Grant a role, or change the one held. */
export function setConsoleOperator(userId: string, roleId: string, token?: string) {
	return api<ConsoleOperator>({
		method: 'PUT',
		path: `/v1/console/operators/${encodeURIComponent(userId)}`,
		body: { role_id: roleId },
		token
	});
}

export function revokeConsoleOperator(userId: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/console/operators/${encodeURIComponent(userId)}`, token });
}

/** `page` and `per_page`; newest first. */
/** One audit entry, so `?entry=` opens whatever page it is on; null when unknown. */
export function consoleAuditEntry(id: string, token?: string): Promise<ConsoleAuditEntry | null> {
	return consoleRecord(`/v1/console/audit/${encodeURIComponent(id)}`, token);
}

export function listConsoleAudit(query: URLSearchParams, token?: string): Promise<Envelope<ConsoleAuditEntry[]>> {
	return consoleRead('/v1/console/audit', token, query);
}

/** A plan (PLN-1). A null limit is unlimited; `features` are keys of `PLAN_FEATURES`. */
export type ConsolePlan = {
	id: string;
	name: string;
	max_tokens_month: number | null;
	max_storage_bytes: number | null;
	is_system: boolean;
	features: string[];
	/** How many workspaces hold it, deleted ones included. */
	workspaces: number;
	created_at: string;
};

export type ConsolePlanBody = {
	name?: string;
	max_tokens_month?: number | null;
	max_storage_bytes?: number | null;
	features?: string[];
};

/** Every live plan, the system plan first. */
export async function listConsolePlans(token?: string): Promise<ConsolePlan[]> {
	return (await consoleRead<ConsolePlan[]>('/v1/console/plans', token)).data ?? [];
}

export function createConsolePlan(body: ConsolePlanBody, token?: string) {
	return api<ConsolePlan>({ method: 'POST', path: '/v1/console/plans', body, token });
}

/** `features`, when sent, replaces the whole set; a null limit is unlimited. */
export function updateConsolePlan(id: string, body: ConsolePlanBody, token?: string) {
	return api<ConsolePlan>({ method: 'PATCH', path: `/v1/console/plans/${encodeURIComponent(id)}`, body, token });
}

/** 409 PLAN_IN_USE while any workspace holds it. */
export function deleteConsolePlan(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/console/plans/${encodeURIComponent(id)}`, token });
}

/** Give a workspace a plan (PLN-3). */
export function setConsoleWorkspacePlan(workspaceId: string, planId: string, token?: string) {
	return api<ConsoleWorkspaceRow>({
		method: 'PUT',
		path: `/v1/console/workspaces/${encodeURIComponent(workspaceId)}/plan`,
		body: { plan_id: planId },
		token
	});
}
