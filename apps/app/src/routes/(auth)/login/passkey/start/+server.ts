import { json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { startPasskeySignIn } from '$lib/server/account';

import type { RequestHandler } from './$types';

/**
 * The first half of a passkey sign-in (D110): a challenge for the browser
 * to sign. A POST, because it writes the ceremony the second half claims.
 */
export const POST: RequestHandler = async () => {
	try {
		const started = await startPasskeySignIn();
		return json(started.data);
	} catch (error) {
		if (error instanceof ApiError) return json({ code: error.code }, { status: error.status });
		throw error;
	}
};
