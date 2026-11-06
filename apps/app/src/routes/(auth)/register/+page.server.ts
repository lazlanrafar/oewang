import { fail, redirect, type Actions } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';
import { setSession, type IssuedSession } from '$lib/server/session';
import { safeNext } from '$lib/workspaces';

/**
 * Sign up: an account and nothing else (D109). The workspace comes after,
 * on its own page, or from the invitation that brought them here, which
 * `next` carries through.
 */
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const next = safeNext(String(form.get('next') ?? ''), '');

		const fields: Record<string, string> = {};
		if (!email) fields.email = 'required';
		if (!password) fields.password = 'required';
		if (Object.keys(fields).length > 0) {
			return fail(400, { email, name, fields });
		}

		try {
			const result = await api<IssuedSession>({
				method: 'POST',
				path: '/v1/auth/register',
				body: { email, password, name: name || null }
			});
			if (result.data) setSession(cookies, result.data);
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, {
					email,
					name,
					code: error.code,
					fields: error.fields
				});
			}
			throw error;
		}

		redirect(303, next ? `/sync?next=${encodeURIComponent(next)}` : '/sync');
	}
};
