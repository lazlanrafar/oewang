import { error } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { readAvatar } from '$lib/server/account';

import type { RequestHandler } from './$types';

/**
 * The signed-in person's photo, for an `<img>` on this app's own origin
 * (D94). The bytes travel from the API inside the envelope, never as an
 * object-storage URL (D23). The `?v=` the page adds changes with every new
 * photo, so the browser may keep each version for a day.
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const result = await readAvatar(locals.accessToken);
		const bytes = Buffer.from(result.data?.data ?? '', 'base64');

		return new Response(new Uint8Array(bytes), {
			headers: {
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
