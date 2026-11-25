import type { LayoutServerLoad } from './$types';

import { readConsoleMe } from '$lib/server/console';

/**
 * The operator, read on every navigation: the API re-reads the role per
 * request (D126), so a revoked operator loses the console on their next
 * click. hooks.server.ts has already checked the host and Cloudflare Access.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { operator: await readConsoleMe(locals.accessToken) };
};
