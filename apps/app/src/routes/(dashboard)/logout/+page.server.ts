import { redirect, type Actions } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';
import { clearSession, readRefreshToken } from '$lib/server/session';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const refreshToken = readRefreshToken(cookies);

		if (refreshToken) {
			try {
				await api({
					method: 'POST',
					path: '/v1/auth/logout',
					body: { refresh_token: refreshToken }
				});
			} catch (error) {
				// Clearing the cookies is what the user asked for. A failure
				// to revoke server side must not leave them looking signed in.
				if (!(error instanceof ApiError)) throw error;
			}
		}

		clearSession(cookies);
		redirect(303, '/login');
	}
};
