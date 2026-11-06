import { json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { finishPasskeyRegistration } from '$lib/server/account';

import type { RequestHandler } from './$types';

/** The second half: the API checks what the device made and keeps it. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = await request.json().catch(() => null);
	if (!body || typeof body.ceremony_id !== 'string' || typeof body.credential !== 'object') {
		return json({ code: 'MALFORMED_REQUEST' }, { status: 400 });
	}

	try {
		const created = await finishPasskeyRegistration(
			{
				ceremony_id: body.ceremony_id,
				name: typeof body.name === 'string' ? body.name : null,
				credential: body.credential
			},
			locals.accessToken
		);
		return json(created.data, { status: 201 });
	} catch (error) {
		if (error instanceof ApiError) return json({ code: error.code }, { status: error.status });
		throw error;
	}
};
