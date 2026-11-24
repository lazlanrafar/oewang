import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { readSpreadsheet } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * Step one of the import wizard for an `.xlsx` (D111).
 *
 * A CSV is split in the browser. A spreadsheet is not, because the only npm
 * reader carries an advisory and would run in the session's context, so the
 * browser posts the file's bytes here and this route hands them to the API,
 * which reads the first sheet and answers the shape a parsed CSV has. Steps
 * two to four do not know which kind of file they were given.
 */

/** The API's cap (`MAX_SPREADSHEET_BYTES`), checked here first so an
 *  oversized file is not encoded and sealed only to be refused. */
const MAX_BYTES = 512 * 1024;

export const POST: RequestHandler = async ({ locals, request }) => {
	const bytes = new Uint8Array(await request.arrayBuffer());

	if (bytes.length === 0) error(400, 'VALIDATION_FAILED');
	if (bytes.length > MAX_BYTES) error(413, 'SPREADSHEET_TOO_LARGE');

	try {
		const sheet = await readSpreadsheet(bytes, locals.accessToken);
		return json(sheet.data);
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
