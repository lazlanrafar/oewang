import { fail, redirect, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { createAndEnterWorkspace, readMe } from '$lib/server/account';
import { setSession } from '$lib/server/session';
import { safeNext } from '$lib/workspaces';

import type { PageServerLoad } from './$types';

/**
 * The first workspace, made after signing up rather than on the sign-up
 * form (D109). The old app's create-workspace page without its plan step,
 * since billing is a non-goal (D92).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const me = await readMe(locals.accessToken);
	return { email: me.data?.user.email ?? '' };
};

export const actions: Actions = {
	/** Create it, move the session into it, then on to where they were going. */
	default: async ({ request, locals, cookies, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const currency = String(form.get('currency_code') ?? '').trim();

		try {
			const session = await createAndEnterWorkspace(
				{ name, currency_code: currency },
				locals.accessToken
			);
			if (session.data) setSession(cookies, session.data);
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields, name });
			}
			throw error;
		}

		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
