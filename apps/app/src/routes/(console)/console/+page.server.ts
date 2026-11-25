import { consoleOverview } from '$lib/server/console';

import type { PageServerLoad } from './$types';

/** The console's front page (CSL-9, US-084): the figures across oewang. */
export const load: PageServerLoad = async ({ locals }) => ({
	overview: await consoleOverview(locals.accessToken)
});
