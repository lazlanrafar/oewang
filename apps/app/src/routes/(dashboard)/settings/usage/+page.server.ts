import { workspaceUsage, type WorkspaceUsage } from '$lib/server/usage';

import type { PageServerLoad } from './$types';

/**
 * What the workspace stores and what the assistant has spent (D92, USG-3).
 *
 * Readable by any member, like the assistant section: nothing here is
 * secret, and nothing here can be changed.
 */
export const load: PageServerLoad = async ({ locals }) => ({
	usage: await readUsage(locals.accessToken)
});

async function readUsage(token?: string): Promise<WorkspaceUsage | null> {
	try {
		return (await workspaceUsage(token)).data ?? null;
	} catch {
		return null;
	}
}
