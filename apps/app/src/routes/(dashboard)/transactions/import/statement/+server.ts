import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { startStatementImport } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * Start a statement import (AI-4).
 *
 * The image or PDF is already in the vault, so this carries its id and the
 * wallet the rows land in. The API answers `202` with a job id and does the
 * extraction in a background task; the modal beside this route polls the
 * route next door every two seconds.
 *
 * Retrying a stale or failed job comes back here with the same file id,
 * because a failed job keeps its upload and a retry should not re-upload.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => null)) as {
		vault_file_id?: unknown;
		wallet_id?: unknown;
	} | null;

	const fileId = typeof body?.vault_file_id === 'string' ? body.vault_file_id : '';
	const walletId = typeof body?.wallet_id === 'string' ? body.wallet_id : '';

	// A statement is one account's statement: a row with no wallet moves no
	// balance. The API validates both again, and that is the control.
	if (fileId === '' || walletId === '') error(400, 'VALIDATION_FAILED');

	try {
		const started = await startStatementImport(
			{ vault_file_id: fileId, wallet_id: walletId },
			locals.accessToken
		);
		return json(started.data);
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
