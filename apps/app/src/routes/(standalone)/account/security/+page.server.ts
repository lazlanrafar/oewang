import { fail, redirect, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import {
	changePassword,
	listPasskeys,
	listSessions,
	logoutEverywhere,
	removePasskey
} from '$lib/server/account';
import { clearSession, setSession } from '$lib/server/session';

import type { PageServerLoad } from './$types';

/** Password, passkeys and sessions (AUTH-12, D94, D110). */
export const load: PageServerLoad = async ({ locals }) => {
	const [sessions, passkeys] = await Promise.all([
		listSessions(locals.accessToken).catch(() => null),
		listPasskeys(locals.accessToken).catch(() => null)
	]);
	return { sessions: sessions?.data ?? [], passkeys: passkeys?.data ?? [] };
};

export const actions: Actions = {
	/**
	 * The API ends every other session and hands this browser a new one,
	 * which goes straight into the cookies, so the person who changed the
	 * password stays signed in here.
	 */
	password: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		try {
			const result = await changePassword(
				{
					current_password: String(form.get('current_password') ?? ''),
					new_password: String(form.get('new_password') ?? '')
				},
				locals.accessToken
			);
			if (result.data) setSession(cookies, result.data);
			return { ok: true };
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, { code: error.code, fields: error.fields });
			}
			throw error;
		}
	},

	/**
	 * Stop a passkey signing in. The copy on the device stays until the
	 * person deletes it there; the server simply no longer accepts it.
	 */
	removePasskey: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			await removePasskey(String(form.get('id') ?? ''), locals.accessToken);
			return { removed: true };
		} catch (error) {
			if (error instanceof ApiError) return fail(error.status, { code: error.code });
			throw error;
		}
	},

	/** Every device, this one included, then the sign-in page. */
	logoutAll: async ({ locals, cookies }) => {
		try {
			await logoutEverywhere(locals.accessToken);
		} catch (error) {
			if (!(error instanceof ApiError)) throw error;
		}
		clearSession(cookies);
		redirect(303, '/login');
	}
};
