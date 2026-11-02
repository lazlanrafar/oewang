import { fail, type Actions } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();

		if (!email) return fail(400, { fields: { email: 'required' } });

		try {
			await api({ method: 'POST', path: '/v1/auth/forgot-password', body: { email } });
		} catch (error) {
			// Rate limiting is the one failure worth reporting. Anything else
			// is swallowed: a visible difference between a known and an
			// unknown address is exactly what AUTH-10 forbids.
			if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
				return fail(429, { code: error.code });
			}
			if (!(error instanceof ApiError)) throw error;
		}

		return { sent: true };
	}
};
