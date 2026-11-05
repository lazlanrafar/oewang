import { fail, redirect, type Actions } from '@sveltejs/kit';

import { toResponseLanguage } from '$lib/ai-settings';
import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { ApiError } from '$lib/server/api';
import * as chat from '$lib/server/chat';
import * as ledger from '$lib/server/ledger';
import type { PageServerLoad } from './$types';

/**
 * Categories and the agent settings.
 *
 * Wallets used to load here too. They live on /accounts now (US-013b), so
 * this page reads only what its two remaining tabs render.
 */
export const load: PageServerLoad = async ({ depends, locals, url }) => {
	const token = locals.accessToken;

	// Anyone holding a link to the old wallets tab lands on the page that
	// owns wallets now, rather than on a tab that no longer exists.
	if (url.searchParams.get('tab') === 'wallets') redirect(307, '/accounts');

	// What a chat write makes stale here (D32, CHAT-12). The map lives in
	// $lib/chat-invalidation; this is the end that declares the data.
	depends(INVALIDATION_KEYS.categories);

	const [categories, assistant] = await Promise.all([
		ledger.listCategories(token),
		// Readable by any member (CHAT-10): a member cannot change what the
		// assistant is told, but seeing it explains the answers they get.
		readAssistant(token)
	]);

	return {
		categories: categories.data ?? [],
		assistant
	};
};

/**
 * The agent settings, or null when they could not be read.
 *
 * Null rather than defaults, and the tab says so rather than showing an
 * empty form. Rendering "nothing set" over a read that failed invites an
 * admin to save that over instructions which are actually in force.
 *
 * The categories read is not guarded: without them there is no settings
 * page to show. This one is a tab.
 */
async function readAssistant(token?: string): Promise<chat.AgentSettings | null> {
	try {
		return (await chat.readSettings(token)).data ?? null;
	} catch {
		return null;
	}
}

/** Everything a settings form can do. Each one re-reads nothing: the page reloads. */
export const actions: Actions = {
	createCategory: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.createCategory(
				{ name: text(form, 'name'), type: text(form, 'type') },
				locals.accessToken
			)
		),

	updateCategory: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateCategory(
				text(form, 'id'),
				{ name: text(form, 'name'), type: text(form, 'type') },
				locals.accessToken
			)
		),

	moveCategory: async ({ request, locals }) =>
		run(request, async (form) => {
			const categories = (await ledger.listCategories(locals.accessToken)).data ?? [];
			await swap(
				categories.filter((category) => category.type === text(form, 'type')),
				text(form, 'id'),
				text(form, 'direction'),
				(id, sort_order) => ledger.updateCategory(id, { sort_order }, locals.accessToken)
			);
		}),

	deleteCategory: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteCategory(text(form, 'id'), locals.accessToken)),

	/**
	 * The two agent settings (CHAT-10).
	 *
	 * Both fields go every time, because the form renders both. The
	 * instructions are sent trimmed: the API reads an empty or whitespace
	 * value as "clear it", which is what an emptied textarea means.
	 *
	 * The role is not checked here. `PATCH /v1/ai/settings` is admin and
	 * above and the API re-reads the membership row, so a member who posts
	 * this by hand is refused there (AUTH-4). The page hides the form
	 * because offering an edit that will be refused is bad manners, not
	 * because hiding it is the control.
	 */
	updateAssistant: async ({ request, locals }) =>
		run(request, (form) =>
			chat.updateSettings(
				{
					custom_instructions: text(form, 'custom_instructions'),
					// A `<select>` is user input like any other, and a value
					// the API does not know would be a 422 for a field the
					// user never typed in.
					response_language: toResponseLanguage(form.get('response_language'))
				},
				locals.accessToken
			)
		)
};

/**
 * Run one action, turning an API error into a field-aware failure.
 *
 * The code comes back rather than a message: the page maps it through the
 * dictionary, because the API's own message is for developers (UI-1).
 */
async function run(request: Request, call: (form: FormData) => Promise<unknown>) {
	const form = await request.formData();

	try {
		await call(form);
		return { ok: true };
	} catch (error) {
		if (error instanceof ApiError) {
			return fail(error.status, { code: error.code, fields: error.fields });
		}
		throw error;
	}
}

/**
 * Move one row up or down among its siblings.
 *
 * Positions are rewritten from the list's current order rather than nudged,
 * because seeded rows all carry `sort_order` 0 and nudging one of them
 * would move nothing.
 */
async function swap<T extends { id: string }>(
	siblings: T[],
	id: string,
	direction: string,
	write: (id: string, sortOrder: number) => Promise<unknown>
): Promise<void> {
	const from = siblings.findIndex((row) => row.id === id);
	if (from < 0) return;

	const to = direction === 'up' ? from - 1 : from + 1;
	if (to < 0 || to >= siblings.length) return;

	const reordered = [...siblings];
	[reordered[from], reordered[to]] = [reordered[to], reordered[from]];

	await Promise.all(reordered.map((row, index) => write(row.id, index)));
}

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}

/** An empty field is `null`, never `''`: the API tells the two apart. */
function optional(form: FormData, key: string): string | null {
	const value = text(form, key);
	return value === '' ? null : value;
}
