import { fail, redirect, type Actions } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';
import { setSession, type IssuedSession } from '$lib/server/session';

/** Only same-origin paths, so `?next=` cannot become an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
	const next = typeof value === 'string' ? value : '';
	return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const next = safeNext(form.get('next'));

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

		redirect(303, next);
	}
};
