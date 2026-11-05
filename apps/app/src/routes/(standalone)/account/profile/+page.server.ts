import { fail, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { deleteAvatar, putAvatar, updateProfile } from '$lib/server/account';

/**
 * The profile section (AUTH-11, AUTH-13). The person comes from the layout;
 * these are its three writes.
 */
export const actions: Actions = {
	update: async ({ request, locals }) =>
		run(async () => {
			const form = await request.formData();
			const name = String(form.get('name') ?? '').trim();
			await updateProfile({ name: name || null }, locals.accessToken);
		}, 'profile'),

	photo: async ({ request, locals }) =>
		run(async () => {
			const form = await request.formData();
			await putAvatar(String(form.get('data') ?? ''), locals.accessToken);
		}, 'photo'),

	removePhoto: async ({ locals }) =>
		run(() => deleteAvatar(locals.accessToken), 'photo_removed')
};

async function run(call: () => Promise<unknown>, done: string) {
	try {
		await call();
		return { ok: true, done };
	} catch (error) {
		if (error instanceof ApiError) {
			return fail(error.status, { code: error.code, fields: error.fields, done });
		}
		throw error;
	}
}
