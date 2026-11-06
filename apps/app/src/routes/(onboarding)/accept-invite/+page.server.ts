import { redirect } from '@sveltejs/kit';

import { readMe, switchWorkspace } from '$lib/server/account';
import { ApiError } from '$lib/server/api';
import { setSession } from '$lib/server/session';
import { acceptInvite } from '$lib/server/workspaces';

import type { PageServerLoad } from './$types';

/**
 * Where an invitation email lands (WS-3).
 *
 * Signed out, the guard in hooks.server.ts has already sent the visitor to
 * sign in with this address as `next`, so they come back here. Signed in,
 * the invitation is accepted and the session moved into the workspace it
 * was for, the way creating one does. Only the address the invitation was
 * sent to may accept it; anyone else sees why it did not work.
 *
 * Accepting in a load rather than an action: the link in the email is a
 * GET, and asking the reader to press a second button to do what the link
 * says adds a step without adding a decision.
 *
 * Reachable without a workspace (D109): accepting is how someone who has
 * just signed up joins the workspace they were invited to.
 */
export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const token = url.searchParams.get('token') ?? '';
	if (!token) return { error: 'missing' as const };

	try {
		const accepted = await acceptInvite(token, locals.accessToken);
		const session = await switchWorkspace(accepted.data!.workspace_id, locals.accessToken);
		if (session.data) setSession(cookies, session.data);
	} catch (error) {
		if (error instanceof ApiError) {
			const me = await readMe(locals.accessToken);
			return { error: 'invalid' as const, email: me.data?.user.email ?? '' };
		}
		throw error;
	}

	redirect(303, '/overview');
};
