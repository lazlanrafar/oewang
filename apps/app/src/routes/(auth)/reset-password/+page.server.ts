import { fail, type Actions } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

import { api, ApiError } from '$lib/server/api';
import { clearSession } from '$lib/server/session';

export const load: PageServerLoad = ({ url }) => {
	// The token arrives in the link. Carried through the form so the page
	// works without JavaScript, and never put back into the address bar.
	return { token: url.searchParams.get('token') ?? '' };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		const password = String(form.get('password') ?? '');

		if (!token) return fail(400, { code: 'RESET_TOKEN_INVALID' });
		if (!password) return fail(400, { fields: { password: 'required' } });

		try {
			await api({ method: 'POST', path: '/v1/auth/reset-password', body: { token, password } });
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields });
			}
			throw error;
		}

		// The API revoked every session for this user. Clear the cookies here
		// too, so a stale browser session cannot look signed in.
		clearSession(cookies);
		return { done: true };
	}
};
