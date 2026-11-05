import { error } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { markNoticesSeen } from '$lib/server/receipts';

import type { RequestHandler } from './$types';

/** The shell has told the person how their queued receipts ended (D95). */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
	const ids = Array.isArray(body?.ids)
		? body.ids.filter((id): id is string => typeof id === 'string').slice(0, 50)
		: [];
	if (ids.length === 0) return new Response(null, { status: 204 });

	try {
		await markNoticesSeen(ids, locals.accessToken);
		return new Response(null, { status: 204 });
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
