import { listWorkspaces, readMe } from '$lib/server/account';

import type { LayoutServerLoad } from './$types';

/**
 * Pages outside the app shell (D94): the workspaces page and the account
 * area. They belong to a person rather than to one workspace, so they have
 * no sidebar and no top bar, and read only who is signed in and where they
 * may go. The guard in hooks.server.ts has already ensured a session.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const [me, workspaces] = await Promise.all([
		readMe(locals.accessToken),
		listWorkspaces(locals.accessToken)
	]);

	return { me: me.data!, workspaces: workspaces.data ?? [] };
};
