import * as chat from '$lib/server/chat';

import type { LayoutServerLoad } from './$types';

/**
 * The conversation list, loaded once for every chat screen (CHAT-1).
 *
 * In the layout rather than the page, so switching conversations does not
 * refetch the list, and so `/chat` and `/chat/{id}` show the same sidebar.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const sessions = await chat.listSessions(locals.accessToken);

	return { sessions: sessions.data ?? [] };
};
