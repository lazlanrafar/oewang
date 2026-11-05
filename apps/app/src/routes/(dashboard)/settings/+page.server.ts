import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/**
 * `/settings` is not a page: it opens the first section, as the old app's
 * did (D82).
 *
 * The two tab links that used to live here still land somewhere real:
 * wallets moved to /accounts (US-013b) and the assistant tab is its own
 * section now.
 */
export const load: PageServerLoad = ({ url }) => {
	const tab = url.searchParams.get('tab');
	if (tab === 'wallets') redirect(307, '/accounts');
	if (tab === 'assistant') redirect(307, '/settings/assistant');
	redirect(307, '/settings/income-category');
};
