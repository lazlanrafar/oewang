import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/** The group has no page of its own; its first table stands in for it. */
export const load: PageServerLoad = () => {
	redirect(307, '/database/rates');
};
