import { error } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { readThumbnail } from '$lib/server/vault';

import type { RequestHandler } from './$types';

/**
 * A file's small square preview, for a tile (D91).
 *
 * Made by the API the first time anybody asks, and served through this
 * server like every other byte: the browser gets an `<img>` source on this
 * app's own origin, never an object-storage URL (D5, D23). A file's bytes
 * never change, so the browser may keep the preview for a day; `private`
 * keeps it out of any shared cache.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	try {
		const result = await readThumbnail(params.id, locals.accessToken);
		const bytes = Buffer.from(result.data?.data ?? '', 'base64');

		return new Response(new Uint8Array(bytes), {
			headers: {
				// Fixed: the API only ever makes JPEG previews.
				'content-type': 'image/jpeg',
				'cache-control': 'private, max-age=86400',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
