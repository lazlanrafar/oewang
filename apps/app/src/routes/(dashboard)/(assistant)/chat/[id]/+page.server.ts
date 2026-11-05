import { error } from '@sveltejs/kit';

import { isArtifactCanvas, readCanvas } from '$lib/canvas';
import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { filesFromAttachments } from '$lib/chat-tools';
import { ApiError } from '$lib/server/api';
import * as chat from '$lib/server/chat';
import * as ledger from '$lib/server/ledger';
import { readFile, type VaultFile } from '$lib/server/ledger';

import type { PageServerLoad } from './$types';

/**
 * One conversation, loaded server side (CHAT-1).
 *
 * The browser never calls the API (D5), so the messages arrive rendered
 * rather than fetched. The actions that change a session live on `/chat`,
 * and the canvas posts what it confirms to `/transactions`, which is where
 * every transaction write in this app already happens.
 *
 * The wallets and the categories are the canvas's, not the conversation's:
 * the confirmation panel preselects a wallet and a category, and the form
 * it falls back to needs both pickers (AI-3, WAL-3). They are declared
 * against the invalidation map as well, so a wallet the assistant creates
 * mid-conversation reaches the panel without a reload (D32).
 */
export const load: PageServerLoad = async ({ depends, params, url, locals }) => {
	const token = locals.accessToken;

	depends(
		INVALIDATION_KEYS.wallets,
		INVALIDATION_KEYS.categories,
		INVALIDATION_KEYS.walletBalances
	);

	try {
		const [conversation, wallets, categories] = await Promise.all([
			chat.readSession(params.id, token),
			ledger.listWallets(token),
			ledger.listCategories(token)
		]);

		if (!conversation.data) error(404, 'SESSION_NOT_FOUND');

		return {
			conversation: conversation.data,
			wallets: wallets.data ?? [],
			categories: categories.data ?? [],
			files: await describeFiles(conversation.data.messages, token),
			// The file the canvas is open on, so the panel can name it and
			// the manual form can carry it as an attachment. A file that has
			// gone leaves this null and the panel says so.
			canvasFile: await describeCanvasFile(url, token)
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

/**
 * The vault file `?canvas=…&id=…` points at, or null.
 *
 * Only the receipt and the manual form are keyed by a file. An analysis is
 * keyed by its tool call and carries its own data (D88), so it asks the
 * vault nothing.
 */
async function describeCanvasFile(url: URL, token?: string): Promise<VaultFile | null> {
	const canvas = readCanvas(url);
	if (canvas === null || isArtifactCanvas(canvas)) return null;
	const id = canvas.id;

	try {
		return (await readFile(id, token)).data ?? null;
	} catch {
		return null;
	}
}
