import type { LayoutServerLoad } from './$types';

import { SIDEBAR_COOKIE } from '$lib/components/organisms/layouts';
import { readConsoleMe } from '$lib/server/console';

/**
 * The operator, read on every navigation: the API re-reads the role per
 * request (D126), so a revoked operator loses the console on their next
 * click. hooks.server.ts has already checked the host and Cloudflare Access.
 *
 * The sidebar's remembered state too, under the app's own cookie, so the
 * console's rail opens the way it was left, as the dashboard's does.
 */
export const load: LayoutServerLoad = async ({ locals, cookies }) => ({
	operator: await readConsoleMe(locals.accessToken),
	sidebarOpen: cookies.get(SIDEBAR_COOKIE) !== 'false'
});
