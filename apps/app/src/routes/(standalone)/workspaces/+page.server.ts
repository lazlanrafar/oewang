import { fail, redirect, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { createWorkspace, switchWorkspace } from '$lib/server/account';
import { setSession } from '$lib/server/session';
import { safeNext } from '$lib/workspaces';

/**
 * The workspaces page's actions, which the switcher and its dialog post to
 * as well, so switching and creating are one rule each wherever they start
 * (WS-2, WS-6, D94).
 */
export const actions: Actions = {
	/**
	 * Move this browser's session into another workspace and go back where
	 * it was. The API refuses a workspace the user is not a member of.
	 */
	switch: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const workspaceId = String(form.get('workspace_id') ?? '');

		try {
			const result = await switchWorkspace(workspaceId, locals.accessToken);
			if (result.data) setSession(cookies, result.data);
		} catch (error) {
			if (error instanceof ApiError) return fail(error.status, { code: error.code });
			throw error;
		}

		redirect(303, safeNext(String(form.get('next') ?? '')));
	},

	/**
	 * Open a workspace and switch into it in one step. The old dialog left
	 * the user in the workspace they started from.
	 */
	create: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const currency = String(form.get('currency_code') ?? '').trim();

		try {
			const created = await createWorkspace(
				{ name, currency_code: currency },
				locals.accessToken
			);
			const session = await switchWorkspace(created.data!.id, locals.accessToken);
			if (session.data) setSession(cookies, session.data);
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields, name });
			}
			throw error;
		}

		redirect(303, '/overview');
	}
};
