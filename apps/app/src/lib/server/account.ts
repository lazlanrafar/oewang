/**
 * The signed-in person and the workspaces they belong to (D94).
 *
 * Server only. A call that answers with a new session (switching, changing
 * the password) hands it back for the caller to write into the cookies with
 * `setSession`; nothing here touches a cookie.
 */

import { api } from './api';
import type { IssuedSession } from './session';

export type Role = 'owner' | 'admin' | 'member';

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
	return api<Me>({ path: '/v1/auth/me', token });
}

export function listWorkspaces(token?: string) {
	return api<WorkspaceItem[]>({ path: '/v1/workspaces', token });
}

/** A new workspace the caller owns (WS-6). Switch into it separately. */
export function createWorkspace(body: { name: string; currency_code: string }, token?: string) {
	return api<WorkspaceItem>({ method: 'POST', path: '/v1/workspaces', body, token });
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
