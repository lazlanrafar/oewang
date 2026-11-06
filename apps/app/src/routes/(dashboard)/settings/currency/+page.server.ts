import type { Actions } from '@sveltejs/kit';

import { run, text } from '$lib/server/form-action';
import * as workspaces from '$lib/server/workspaces';

import type { PageServerLoad } from './$types';

/**
 * The workspace currency (WAL-5, WAL-6, D104).
 *
 * The lock is read up front so the page can say why the picker is
 * disabled; the API holds the same lock and refuses a change past it with
 * `WORKSPACE_CURRENCY_LOCKED`, so a stale page cannot slip one through.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const workspace = await workspaces.readWorkspace(locals.accessToken);
	return { workspace: workspace.data! };
};

export const actions: Actions = {
	/**
	 * The layout's `me` carries the currency every figure is formatted in,
	 * and a form action reruns every load, so the shell follows the change
	 * without anything invalidated by hand.
	 */
	update: async ({ request, locals }) =>
		run(request, (form) => workspaces.updateCurrency(text(form, 'currency_code'), locals.accessToken))
};
