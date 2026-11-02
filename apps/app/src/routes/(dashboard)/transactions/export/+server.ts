import { error } from '@sveltejs/kit';

import { apiText, ApiError } from '$lib/server/api';
import { filterParams } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * The CSV download (TXN-10).
 *
 * A server route rather than a form action: the browser has to receive a
 * file, and an action returns JSON. The API builds the CSV, marks the rows
 * it covered as exported, and this route passes the bytes through with the
 * headers that make a browser save them.
 *
 * The browser still never talks to the API (D5): this runs on the server.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const body = await apiText({
			path: '/v1/transactions/export',
			query: filterParams(url),
			token: locals.accessToken
		});

		return new Response(body, {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': 'attachment; filename="transactions.csv"',
				// A download is a snapshot of a moment, never a cached one.
				'cache-control': 'no-store'
			}
		});
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
