import { error, json } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { beginUpload } from '$lib/server/ledger';

import type { RequestHandler } from './$types';

/**
 * Start an upload (VLT-1, D23).
 *
 * The browser splits the file and sends chunks to the routes beside this
 * one; this server forwards each into the OWE1 envelope. The browser never
 * talks to the API, and no signed object-storage URL exists anywhere.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json()) as {
		filename?: string;
		content_type?: string;
		size_bytes?: number;
	};

	try {
		const result = await beginUpload(
			{
				filename: String(body.filename ?? 'file'),
				content_type: String(body.content_type ?? ''),
				size_bytes: Number(body.size_bytes ?? 0)
			},
			locals.accessToken
		);

		return json(result.data);
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
