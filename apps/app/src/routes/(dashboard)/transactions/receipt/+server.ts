import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { parseReceipt } from '$lib/server/chat';

import type { RequestHandler } from './$types';

/**
 * Read an uploaded receipt (AI-1 to AI-3).
 *
 * The file is already in the vault, uploaded chunk by chunk through the
 * routes beside this one (D23), so this carries its id. The browser never
 * calls the API (D5), which is why the chat page and the transactions page
 * both come here rather than talking to `/v1/ai/receipt/parse` themselves.
 *
 * Nothing is written. The answer is a draft the confirmation panel opens
 * on, and a transaction exists only once the user confirms one (AI-2).
 *
 * `RECEIPT_UNREADABLE` travels on as itself, with its 422, because the
 * panel has something to offer for it: the manual form with the image
 * already attached (AI-3).
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => null)) as { vault_file_id?: unknown } | null;
	const fileId = typeof body?.vault_file_id === 'string' ? body.vault_file_id : '';

	// The API checks the file belongs to this workspace, and that is the
	// control. This only keeps an empty request from costing a round trip.
	if (fileId === '') error(400, 'VALIDATION_FAILED');

	try {
		const parsed = await parseReceipt(fileId, locals.accessToken);
		return json(parsed.data);
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
