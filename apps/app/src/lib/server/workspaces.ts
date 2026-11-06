/**
 * The current workspace's settings, members and invitations (WS-3, WS-4,
 * WAL-6), and feedback (FB-1).
 *
 * Server only. Every call is scoped by the token: the API reads the
 * workspace from the JWT, never from anything sent here (AUTH-4), and it is
 * the API that decides who may change what.
 */

import type { Role } from './account';
import { api } from './api';

export type Member = {
	user_id: string;
	email: string;
	name: string | null;
	role: Role;
	joined_at: string;
};

export type Invite = {
	id: string;
	email: string;
	role: Role;
	expires_at: string;
	created_at: string;
};

export type CurrentWorkspace = {
	id: string;
	name: string;
	slug: string;
	currency_code: string;
	role: Role;
	/** True once any transaction exists (WAL-6). */
	currency_locked: boolean;
};

export type FeedbackType = 'bug' | 'feature' | 'other';

export function readWorkspace(token?: string) {
	return api<CurrentWorkspace>({ path: '/v1/workspaces/current', token });
}

/** Refused with `WORKSPACE_CURRENCY_LOCKED` once a transaction exists. */
export function updateCurrency(currencyCode: string, token?: string) {
	return api<null>({
		method: 'PATCH',
		path: '/v1/workspaces/current',
		body: { currency_code: currencyCode },
		token
	});
}

/** What converting to `to` would touch, and a rate to start from (WAL-7). Owner only. */
export type ConversionPreview = {
	from: string;
	to: string;
	/** Units of `to` per unit of `from`, a decimal string; null when no snapshot holds the pair. */
	suggested_rate: string | null;
	rate_date: string | null;
	transactions: number;
	budgets: number;
};

export type Conversion = {
	from: string;
	to: string;
	rate: string;
	transactions: number;
	budgets: number;
};

export function previewConversion(to: string, token?: string) {
	return api<ConversionPreview>({
		path: '/v1/workspaces/current/currency/preview',
		// Sealed with the body rules, never left in the path (D22).
		query: new URLSearchParams({ to }),
		token
	});
}

/** Reprice the whole ledger at one rate. The rate is a decimal string (D12). */
export function convertCurrency(body: { currency_code: string; rate: string }, token?: string) {
	return api<Conversion>({
		method: 'POST',
		path: '/v1/workspaces/current/currency/convert',
		body,
		token
	});
}

export function listMembers(token?: string) {
	return api<Member[]>({ path: '/v1/workspaces/current/members', token });
}

export function updateMember(userId: string, role: Role, token?: string) {
	return api<null>({
		method: 'PATCH',
		path: `/v1/workspaces/current/members/${encodeURIComponent(userId)}`,
		body: { role },
		token
	});
}

export function removeMember(userId: string, token?: string) {
	return api<null>({
		method: 'DELETE',
		path: `/v1/workspaces/current/members/${encodeURIComponent(userId)}`,
		token
	});
}

/** Admin and above; a member is refused. */
export function listInvites(token?: string) {
	return api<Invite[]>({ path: '/v1/workspaces/current/invites', token });
}

/** The raw token comes back once, here, and is never readable again. */
export function createInvite(body: { email: string; role: Role }, token?: string) {
	return api<Invite & { token: string }>({
		method: 'POST',
		path: '/v1/workspaces/current/invites',
		body,
		token
	});
}

export function revokeInvite(id: string, token?: string) {
	return api<null>({
		method: 'DELETE',
		path: `/v1/workspaces/current/invites/${encodeURIComponent(id)}`,
		token
	});
}

/** Join through a link. Only the address the invitation was sent to may. */
export function acceptInvite(inviteToken: string, token?: string) {
	return api<{ workspace_id: string }>({
		method: 'POST',
		path: '/v1/workspaces/accept-invite',
		body: { token: inviteToken },
		token
	});
}

export function sendFeedback(body: { type: FeedbackType; message: string }, token?: string) {
	return api<{ id: string }>({ method: 'POST', path: '/v1/feedback', body, token });
}
