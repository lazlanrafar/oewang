import { consoleHealth } from '$lib/server/console';

import type { PageServerLoad } from './$types';

/**
 * Health (CSL-11, US-084): receipt jobs, AI calls per day, and the two
 * places an operator looks next. Each link's URL is deployment config; an
 * unset variable hides its link rather than pointing nowhere.
 */
export const load: PageServerLoad = async ({ locals }) => ({
	health: await consoleHealth(locals.accessToken),
	links: {
		sentry: process.env.CONSOLE_SENTRY_URL || null,
		coolify: process.env.CONSOLE_COOLIFY_URL || null
	}
});
