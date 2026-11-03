import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { readImportJob } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * One poll of a statement import job (AI-4).
 *
 * Open to any role: watching an import is reading, not writing. The modal
 * asks every two seconds until the job settles, and a job that has been
 * pending too long comes back with `stale` set, which is what turns the
 * modal's spinner into a retry (P12).
 *
 * `no-store`, because the next poll must reach the API rather than the
 * answer this one gave.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const job = await readImportJob(params.id, locals.accessToken);
		return json(job.data, { headers: { 'cache-control': 'no-store' } });
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
