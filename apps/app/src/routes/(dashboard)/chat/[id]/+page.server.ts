import { error } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import * as chat from '$lib/server/chat';

import type { PageServerLoad } from './$types';

/**
 * One conversation, loaded server side (CHAT-1).
 *
 * The browser never calls the API (D5), so the messages arrive rendered
 * rather than fetched. The actions that change a session live on `/chat`.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	try {
		const conversation = await chat.readSession(params.id, locals.accessToken);
		if (!conversation.data) error(404, 'SESSION_NOT_FOUND');

		return { conversation: conversation.data };
	} catch (cause) {
		if (cause instanceof ApiError) error(cause.status, cause.code);
		throw cause;
	}
};
