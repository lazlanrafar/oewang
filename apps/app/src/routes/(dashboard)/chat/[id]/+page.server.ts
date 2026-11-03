import { error } from '@sveltejs/kit';

import { filesFromAttachments } from '$lib/chat-tools';
import { ApiError } from '$lib/server/api';
import * as chat from '$lib/server/chat';
import { readFile, type VaultFile } from '$lib/server/ledger';

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

		return {
			conversation: conversation.data,
			files: await describeFiles(conversation.data.messages, locals.accessToken)
		};
	} catch (cause) {
		if (cause instanceof ApiError) error(cause.status, cause.code);
		throw cause;
	}
};

/**
 * The attached files, by id, with the size the viewer needs.
 *
 * A message stores only the file's id, name and type
 * (docs/features/chat.md#message-attachments), and reading one back takes
 * its size: the bytes come down as counted chunks (D23). Resolved here
 * rather than in the browser, which has no way to ask (D5).
 *
 * A file that has since gone leaves its id out of the map rather than
 * failing the page. A conversation outlives the things it mentions.
 */
async function describeFiles(
	messages: chat.ChatMessage[],
	token?: string
): Promise<Record<string, VaultFile>> {
	const ids = new Set<string>();
	for (const message of messages) {
		for (const file of filesFromAttachments(message.attachments)) ids.add(file.id);
	}

	const found = await Promise.all(
		[...ids].map(async (id) => {
			try {
				return (await readFile(id, token)).data ?? null;
			} catch {
				return null;
			}
		})
	);

	return Object.fromEntries(found.filter((file) => file !== null).map((file) => [file.id, file]));
}
