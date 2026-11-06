import { redirect } from '@sveltejs/kit';

import { listWorkspaces, readMe, switchWorkspace } from '$lib/server/account';
import { setSession } from '$lib/server/session';
import { safeNext } from '$lib/workspaces';

import type { PageServerLoad } from './$types';

/**
 * The check page every sign-in passes through (D109), as `/sync` was in
 * the old app.
 *
 * A session already in a workspace goes on to where it was headed. One
 * without a workspace is moved into the first the user belongs to, if any.
 * Someone with none at all creates one, unless they came to accept an
 * invitation, which is the other way to have one.
 */
export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const next = safeNext(url.searchParams.get('next'));

	const [me, workspaces] = await Promise.all([
		readMe(locals.accessToken),
		listWorkspaces(locals.accessToken)
	]);

	if (me.data?.workspace) redirect(303, next);

	const first = workspaces.data?.[0];
	if (first) {
		const session = await switchWorkspace(first.id, locals.accessToken);
		if (session.data) setSession(cookies, session.data);
		redirect(303, next);
	}

	if (next.startsWith('/accept-invite')) redirect(303, next);

	redirect(
		303,
		next === '/overview' ? '/workspace-create' : `/workspace-create?next=${encodeURIComponent(next)}`
	);
};
