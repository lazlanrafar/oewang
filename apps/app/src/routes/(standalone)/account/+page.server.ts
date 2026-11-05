import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/** `/account` is not a page: it opens the first section, as settings does. */
export const load: PageServerLoad = () => {
	redirect(307, '/account/profile');
};
