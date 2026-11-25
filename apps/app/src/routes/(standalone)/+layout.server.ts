import { redirect } from '@sveltejs/kit';

import { listWorkspaces, readMe } from '$lib/server/account';

import type { LayoutServerLoad } from './$types';

/**
 * Pages outside the app shell (D94): the workspaces page and the account
 * area. They belong to a person rather than to one workspace, so they have
 * no sidebar and no top bar, and read only who is signed in and where they
 * may go. The guard in hooks.server.ts has already ensured a session, and
 * a session with no workspace yet is sent to the check page (D109).
 *
 * A suspended workspace is let through (D127): this is where its members
 * pick another workspace or leave, so it must not show the suspended page.
 * Nothing here reads the role.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const [me, workspaces] = await Promise.all([
		readMe(locals.accessToken),
		listWorkspaces(locals.accessToken)
	]);

	const account = me.data!;
	if (!account.workspace) {
		redirect(303, `/sync?next=${encodeURIComponent(url.pathname + url.search)}`);
	}

	return {
		me: { ...account, workspace: account.workspace },
		workspaces: workspaces.data ?? []
	};
};
