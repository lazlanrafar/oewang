import * as consoleApi from '$lib/server/console';
import { run, text } from '$lib/server/form-action';

import type { Actions, PageServerLoad } from './$types';

/**
 * The console's operators (CSL-2, US-085): who holds a console role, and
 * the roles there are to give. Both lists are short, so neither pages.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const [operators, roles] = await Promise.all([
		consoleApi.listConsoleOperators(locals.accessToken),
		consoleApi.listConsoleRoles(locals.accessToken)
	]);
	return { operators, roles };
};

/**
 * Grant or change a role, and revoke it. The API refuses the caller's own
 * row, a disabled user, a role wider than the caller's, and the last owner.
 */
export const actions: Actions = {
	save: async ({ request, locals }) =>
		run(request, (form) =>
			consoleApi.setConsoleOperator(text(form, 'user_id'), text(form, 'role_id'), locals.accessToken)
		),

	revoke: async ({ request, locals }) =>
		run(request, (form) => consoleApi.revokeConsoleOperator(text(form, 'user_id'), locals.accessToken))
};
