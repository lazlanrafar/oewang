import { readMonth } from '$lib/console';
import { consoleUsage } from '$lib/server/console';

import type { PageServerLoad } from './$types';

/**
 * AI use across every workspace for one month (CSL-10, US-084). The month
 * lives in the URL (`?month=YYYY-MM`, UI-8); absent or malformed, the API
 * answers for the current month in UTC and says which one it was.
 */
export const load: PageServerLoad = async ({ locals, url }) => ({
	usage: await consoleUsage(readMonth(url.searchParams.get('month')), locals.accessToken)
});
