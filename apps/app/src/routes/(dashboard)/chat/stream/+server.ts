import { error } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import { streamTurn } from '$lib/server/chat';

import type { RequestHandler } from './$types';

/**
 * The chat stream, browser side (CHAT-2, D5).
 *
 * The browser cannot call the API and holds no token, so this is the only
 * way a token reaches the page. It attaches the JWT from the cookie, opens
 * the API's sealed event stream and writes the events on as they arrive.
 *
 * Nothing here buffers, collects or waits for the turn to finish. A proxy
 * that holds the events back turns a streaming chat into a slow request
 * (docs/features/chat.md#streaming).
 *
 * This answers the page's `fetch`, not an `EventSource`: the turn carries a
 * body, and `EventSource` can only issue a GET.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json()) as {
		session_id?: unknown;
		message?: unknown;
		attachment_ids?: unknown;
	};

	const sessionId = typeof body.session_id === 'string' ? body.session_id : '';
	const message = typeof body.message === 'string' ? body.message.trim() : '';
	// Ids of files already in the vault, uploaded through this app's own
	// upload routes. The API checks each one belongs to the workspace
	// before the turn starts, which is the control; this only keeps a
	// malformed body from travelling.
	const attachmentIds = Array.isArray(body.attachment_ids)
		? body.attachment_ids.filter((id): id is string => typeof id === 'string')
		: [];

	// The API validates again, and that is the control. This only keeps an
	// empty turn from costing a round trip.
	if (!sessionId || !message) error(400, 'VALIDATION_FAILED');

	try {
		const events = await streamTurn(
			{ session_id: sessionId, message, attachment_ids: attachmentIds },
			locals.accessToken,
			// Aborted by SvelteKit when the browser disconnects, which is what
			// the stop button does. That tears down the hop to the API, which
			// is how a turn is stopped (CHAT-9).
			request.signal
		);

		return new Response(events, {
			headers: {
				'content-type': 'text/event-stream',
				// A turn is a moment, never a cached one.
				'cache-control': 'no-store',
				// nginx buffers a proxied response by default, which would
				// hold every token until the turn ended.
				'x-accel-buffering': 'no'
			}
		});
	} catch (failure) {
		if (failure instanceof ApiError) error(failure.status, failure.code);
		throw failure;
	}
};
