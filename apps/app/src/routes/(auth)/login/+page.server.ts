import { fail, redirect, type Actions } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';
import { setSession, type IssuedSession } from '$lib/server/session';
import { safeNext } from '$lib/workspaces';


export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = safeNext(String(form.get('next') ?? ''), '');

		if (!email || !password) {
			return fail(400, {
				email,
				fields: {
					...(email ? {} : { email: 'required' }),
					...(password ? {} : { password: 'required' })
				}
			});
		}

		try {
			const result = await api<IssuedSession>({
				method: 'POST',
				path: '/v1/auth/login',
				body: { email, password }
			});
			if (result.data) setSession(cookies, result.data);
		} catch (error) {
			if (error instanceof ApiError) {
				// The email is echoed back so the user does not retype it;
				// the password never is.
				return fail(error.status, { email, code: error.code, fields: error.fields });
			}
			throw error;
		}

		// Through the check page, which also handles a session that has no
		// workspace yet (D109).
		redirect(303, next ? `/sync?next=${encodeURIComponent(next)}` : '/sync');
	}
};
