import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

/**
 * The workspace's front page is the overview (D87).
 *
 * A redirect rather than the overview mounted here, so the address a user
 * shares and the sidebar entry are the same one.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(307, `/overview${url.search}`);
};
