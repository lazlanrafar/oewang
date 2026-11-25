import * as consoleApi from '$lib/server/console';
import { run, text } from '$lib/server/form-action';

import type { Actions, PageServerLoad } from './$types';

/** The console's roles (CSL-2, US-085). A short list, so it does not page. */
export const load: PageServerLoad = async ({ locals }) => ({
	roles: await consoleApi.listConsoleRoles(locals.accessToken)
});

/** The name, the description and the whole permission set, as the form posts them. */
const body = (form: FormData) => ({
	name: text(form, 'name'),
	description: text(form, 'description') || null,
	permissions: form.getAll('permissions').map(String)
});

/**
 * Create, edit and delete. The API refuses a permission the caller does not
 * hold, the system role, the caller's own role, and a role still held.
 */
export const actions: Actions = {
	create: async ({ request, locals }) =>
		run(request, (form) => consoleApi.createConsoleRole(body(form), locals.accessToken)),

	update: async ({ request, locals }) =>
		run(request, (form) => consoleApi.updateConsoleRole(text(form, 'id'), body(form), locals.accessToken)),

	delete: async ({ request, locals }) =>
		run(request, (form) => consoleApi.deleteConsoleRole(text(form, 'id'), locals.accessToken))
};
