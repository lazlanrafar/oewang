/**
 * The signed-in person and the workspaces they belong to (D94).
 *
 * Server only. A call that answers with a new session (switching, changing
 * the password) hands it back for the caller to write into the cookies with
 * `setSession`; nothing here touches a cookie.
 */

import { redirect } from '@sveltejs/kit';

import { api } from './api';
import type { IssuedSession } from './session';

export type Role = 'owner' | 'admin' | 'member';

/** The signed-in person inside a workspace: what every app page reads. */
export type Me = {
	user: {
		id: string;
		email: string;
		name: string | null;
		profile_picture: string | null;
		/** `#rrggbb` income is drawn in, or null for the default (D100). */
		income_color: string | null;
		expense_color: string | null;
	};
	workspace: { id: string; name: string; slug: string; currency_code: string };
	role: Role;
};

/**
 * `/v1/auth/me` as the API answers it: a session opened before the user
 * has a workspace carries none (D109).
 */
export type AccountMe = Omit<Me, 'workspace' | 'role'> & {
	workspace: Me['workspace'] | null;
	role: Role | null;
};

export type PasskeyItem = {
	id: string;
	name: string;
	created_at: string;
	last_used_at: string | null;
};

/** The first half of a passkey ceremony: what the browser is to run. */
export type PasskeyCeremony = {
	ceremony_id: string;
	/** WebAuthn options in their JSON form, for `@simplewebauthn/browser`. */
	options: Record<string, unknown>;
};

export type WorkspaceItem = {
	id: string;
	name: string;
	slug: string;
	currency_code: string;
	role: Role;
};

export type SessionItem = {
	id: string;
	user_agent: string | null;
	ip: string | null;
	created_at: string;
	expires_at: string;
};

export function readMe(token?: string) {
	return api<AccountMe>({ path: '/v1/auth/me', token });
}

/**
 * The signed-in person and their workspace, for a page that needs one.
 * A session without a workspace goes to the check page instead, which
 * sends it on to create one or into one it already has (D109); `from` is
 * where to come back to afterwards.
 */
export async function readWorkspaceMe(token: string | undefined, from: URL): Promise<Me> {
	const me = (await readMe(token)).data!;
	if (!me.workspace || !me.role) {
		redirect(303, `/sync?next=${encodeURIComponent(from.pathname + from.search)}`);
	}
	return { ...me, workspace: me.workspace, role: me.role };
}

export function listWorkspaces(token?: string) {
	return api<WorkspaceItem[]>({ path: '/v1/workspaces', token });
}

/** A new workspace the caller owns (WS-6). Switch into it separately. */
export function createWorkspace(body: { name: string; currency_code: string }, token?: string) {
	return api<WorkspaceItem>({ method: 'POST', path: '/v1/workspaces', body, token });
}

/**
 * Open a workspace and move the session into it, in one step (WS-6). The
 * answer is the new session, for the caller to write into the cookies.
 */
export async function createAndEnterWorkspace(
	body: { name: string; currency_code: string },
	token?: string
) {
	const created = await createWorkspace(body, token);
	return switchWorkspace(created.data!.id, token);
}

/** A session re-scoped to another workspace (WS-2). */
export function switchWorkspace(workspaceId: string, token?: string) {
	return api<IssuedSession>({
		method: 'POST',
		path: '/v1/auth/switch-workspace',
		body: { workspace_id: workspaceId },
		token
	});
}

/** Rename yourself (AUTH-11). A blank name clears it. */
export function updateProfile(body: { name: string | null }, token?: string) {
	return api<null>({ method: 'PATCH', path: '/v1/auth/me', body, token });
}

/** Both colours together; null restores the default (UI-12, D100). */
export function updateColors(
	body: { income_color: string | null; expense_color: string | null },
	token?: string
) {
	return api<null>({ method: 'PUT', path: '/v1/auth/me/colors', body, token });
}

/** Every other session ends; the answer is this browser's new one (AUTH-12). */
export function changePassword(
	body: { current_password: string; new_password: string },
	token?: string
) {
	return api<IssuedSession>({ method: 'POST', path: '/v1/auth/change-password', body, token });
}

export function readAvatar(token?: string) {
	return api<{ type: string; data: string }>({ path: '/v1/auth/me/avatar', token });
}

/** A JPEG, PNG or WebP, already shrunk by the browser (AUTH-13). */
export function putAvatar(data: string, token?: string) {
	return api<{ profile_picture: string }>({
		method: 'PUT',
		path: '/v1/auth/me/avatar',
		body: { data },
		token
	});
}

export function deleteAvatar(token?: string) {
	return api<null>({ method: 'DELETE', path: '/v1/auth/me/avatar', token });
}

export function listSessions(token?: string) {
	return api<SessionItem[]>({ path: '/v1/auth/sessions', token });
}

/** Sign out of every device, this one included. */
export function logoutEverywhere(token?: string) {
	return api<null>({ method: 'POST', path: '/v1/auth/logout-all', token });
}

// ------------------------------------------------------------- passkeys

export function listPasskeys(token?: string) {
	return api<PasskeyItem[]>({ path: '/v1/auth/passkeys', token });
}

export function startPasskeyRegistration(token?: string) {
	return api<PasskeyCeremony>({ method: 'POST', path: '/v1/auth/passkeys/register/start', token });
}

export function finishPasskeyRegistration(
	body: { ceremony_id: string; name: string | null; credential: unknown },
	token?: string
) {
	return api<PasskeyItem>({
		method: 'POST',
		path: '/v1/auth/passkeys/register/finish',
		body,
		token
	});
}

export function removePasskey(id: string, token?: string) {
	return api<null>({
		method: 'DELETE',
		path: `/v1/auth/passkeys/${encodeURIComponent(id)}`,
		token
	});
}

/** Sign-in needs no token: the passkey says who it belongs to (D110). */
export function startPasskeySignIn() {
	return api<PasskeyCeremony>({ method: 'POST', path: '/v1/auth/passkey/sign-in/start' });
}

export function finishPasskeySignIn(body: { ceremony_id: string; credential: unknown }) {
	return api<IssuedSession>({ method: 'POST', path: '/v1/auth/passkey/sign-in/finish', body });
}
