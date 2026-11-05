import * as chat from '$lib/server/chat';

import type { LayoutServerLoad } from './$types';

/**
 * The conversation list, loaded once for the overview and every chat
 * screen (CHAT-1, D87): the composer's history button opens it on both.
 *
 * In the layout rather than the page, so switching conversations does not
 * refetch the list.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const sessions = await chat.listSessions(locals.accessToken);

	return { sessions: sessions.data ?? [] };
};
