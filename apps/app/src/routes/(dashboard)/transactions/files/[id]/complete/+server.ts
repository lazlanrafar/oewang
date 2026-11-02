import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { completeUpload } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * Finish an upload.
 *
 * The API verifies every chunk, checks the declared type against the bytes
 * and records the hash. A file that fails leaves nothing behind, so a
 * failure here means there is nothing to clean up (SEC-12).
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	try {
		const result = await completeUpload(params.id, locals.accessToken);
		return json(result.data);
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
