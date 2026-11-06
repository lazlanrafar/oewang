import { json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { startPasskeyRegistration } from '$lib/server/account';

import type { RequestHandler } from './$types';

/** The first half of adding a passkey (D110): what the device is to make. */
export const POST: RequestHandler = async ({ locals }) => {
	try {
		const started = await startPasskeyRegistration(locals.accessToken);
		return json(started.data);
	} catch (error) {
		if (error instanceof ApiError) return json({ code: error.code }, { status: error.status });
		throw error;
	}
};
