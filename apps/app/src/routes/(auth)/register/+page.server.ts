import { fail, redirect, type Actions } from '@sveltejs/kit';

import { api, ApiError } from '$lib/server/api';
import { setSession, type IssuedSession } from '$lib/server/session';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const workspaceName = String(form.get('workspace_name') ?? '').trim();

		const fields: Record<string, string> = {};
		if (!email) fields.email = 'required';
		if (!password) fields.password = 'required';
		if (!workspaceName) fields.workspace_name = 'required';
		if (Object.keys(fields).length > 0) {
			return fail(400, { email, name, workspaceName, fields });
		}

		try {
			const result = await api<IssuedSession>({
				method: 'POST',
				path: '/v1/auth/register',
				body: { email, password, name: name || null, workspace_name: workspaceName }
			});
			if (result.data) setSession(cookies, result.data);
		} catch (error) {
			if (error instanceof ApiError) {
				return fail(error.status, {
					email,
					name,
					workspaceName,
					code: error.code,
					fields: error.fields
				});
			}
			throw error;
		}

		redirect(303, '/');
	}
};
