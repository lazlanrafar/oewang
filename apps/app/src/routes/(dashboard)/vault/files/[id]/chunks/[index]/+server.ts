import { error } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { putChunk, readChunk } from '$lib/server/vault';

import type { RequestHandler } from './$types';

/**
 * One chunk on its way up.
 *
 * The browser sends the raw bytes; this turns them into the base64 the
 * wire contract specifies and forwards them inside the envelope. Doing the
 * base64 here rather than in the browser keeps the request from the
 * browser a third smaller.
 */
export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const bytes = new Uint8Array(await request.arrayBuffer());

	try {
		await putChunk(
			params.id,
			Number(params.index),
			Buffer.from(bytes).toString('base64'),
			locals.accessToken
		);
		return new Response(null, { status: 204 });
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};

/**
 * One chunk on its way back (VLT-3, D23).
 *
 * The browser assembles the chunks into a Blob and shows it from an object
 * URL. Bytes never leave the envelope between here and the API, and the
 * browser is never handed a path to object storage.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const chunk = await readChunk(params.id, Number(params.index), locals.accessToken);
		const bytes = Buffer.from(chunk.data?.data ?? '', 'base64');

		return new Response(new Uint8Array(bytes), {
			headers: {
				// Fixed to a type the browser will not run, whatever the file
				// claims to be. The component sets the real type on the Blob.
				'content-type': 'application/octet-stream',
				'content-disposition': 'attachment',
				'cache-control': 'no-store'
			}
		});
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
