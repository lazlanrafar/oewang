import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { mapColumns } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * The AI column mapping (AI-9, D28).
 *
 * Column names and two sample rows go to the AI service, which answers
 * with a mapping and nothing else. Every row is transformed in Rust
 * afterwards, so the model never sees an amount and cannot move a decimal
 * point.
 *
 * Two rules hold this route together, and both exist because the model is
 * the optional half of step two:
 *
 * - **It never blocks the wizard.** The call is abandoned after
 *   `MAPPING_TIMEOUT`, and a timeout, a refusal and a route that is not
 *   there yet all reach the browser the same way: as a failure the step
 *   answers by letting the user map the columns by hand.
 * - **Only names travel.** The sample rows are capped at two here as well
 *   as in the browser, so a caller that sent the whole file still sends the
 *   model two rows (SEC-18).
 */
const MAPPING_TIMEOUT = 15_000;

/** Two, as the mapping prompt specifies. Capped again here, not trusted. */
const SAMPLE_ROWS = 2;

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => null)) as {
		columns?: unknown;
		sample_rows?: unknown;
	} | null;

	const columns = Array.isArray(body?.columns)
		? body.columns.filter((column): column is string => typeof column === 'string')
		: [];

	if (columns.length === 0) error(400, 'VALIDATION_FAILED');

	const sampleRows = Array.isArray(body?.sample_rows)
		? body.sample_rows.slice(0, SAMPLE_ROWS).map((row) => stringsOnly(row))
		: [];

	try {
		const proposed = await mapColumns(
			{ columns, sample_rows: sampleRows },
			locals.accessToken,
			AbortSignal.timeout(MAPPING_TIMEOUT)
		);

		return json(proposed.data ?? {});
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);

		// A timeout, a dropped connection, a route the API has not
		// registered yet. The wizard treats every one of them the same way,
		// so none of them is worth a shape of its own here.
		error(503, 'AI_UNAVAILABLE');
	}
};

/** One sample row, as cell text. Anything that is not text is dropped. */
function stringsOnly(row: unknown): Record<string, string> {
	if (typeof row !== 'object' || row === null || Array.isArray(row)) return {};

	return Object.fromEntries(
		Object.entries(row as Record<string, unknown>).filter(
			(entry): entry is [string, string] => typeof entry[1] === 'string'
		)
	);
}
