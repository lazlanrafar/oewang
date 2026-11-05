import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { parseReceipt } from '$lib/server/chat';
import { queueReceipt, READER_BUSY_CODES } from '$lib/server/receipts';

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
 *
 * When the reader does not answer at all, the receipt is queued instead of
 * failed (D95): the file is already in the vault, the API retries it and
 * saves the expense when the reader is back. The answer is a 202, so nobody
 * has to upload the same photo again.
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
		if (failure instanceof ApiError && READER_BUSY_CODES.includes(failure.code)) {
			await queueReceipt(fileId, locals.accessToken);
			return json({ queued: true }, { status: 202 });
		}
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
