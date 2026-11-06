import { listWorkspaces, readWorkspaceMe } from '$lib/server/account';

import type { LayoutServerLoad } from './$types';

/**
 * Pages outside the app shell (D94): the workspaces page and the account
 * area. They belong to a person rather than to one workspace, so they have
 * no sidebar and no top bar, and read only who is signed in and where they
 * may go. The guard in hooks.server.ts has already ensured a session, and
 * a session with no workspace yet is sent to the check page (D109).
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const [me, workspaces] = await Promise.all([
		readWorkspaceMe(locals.accessToken, url),
		listWorkspaces(locals.accessToken)
	]);

	return { me, workspaces: workspaces.data ?? [] };
};
