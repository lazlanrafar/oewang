import { fail, type Actions } from '@sveltejs/kit';

import { toResponseLanguage } from '$lib/ai-settings';
import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { ApiError } from '$lib/server/api';
import * as chat from '$lib/server/chat';
import * as ledger from '$lib/server/ledger';
import type { PageServerLoad } from './$types';

/**
 * Wallets, their groups, categories and the agent settings, loaded together.
 *
 * Four reads in parallel rather than in sequence: they do not depend on
 * each other, and the page cannot render until all four have answered.
 */
export const load: PageServerLoad = async ({ depends, locals, parent }) => {
	const token = locals.accessToken;
	const { me } = await parent();

	// What a chat write makes stale here (D32, CHAT-12). The map lives in
	// $lib/chat-invalidation; this is the end that declares the data.
	depends(
		INVALIDATION_KEYS.wallets,
		INVALIDATION_KEYS.walletBalances,
		INVALIDATION_KEYS.categories
	);

	const [wallets, groups, categories, assistant] = await Promise.all([
		ledger.listWallets(token),
		ledger.listWalletGroups(token),
		ledger.listCategories(token),
		// Readable by any member (CHAT-10): a member cannot change what the
		// assistant is told, but seeing it explains the answers they get.
		readAssistant(token)
	]);

	const rows = wallets.data ?? [];

	return {
		wallets: rows,
		groups: groups.data ?? [],
		categories: categories.data ?? [],
		assistant,
		/**
		 * One rate per foreign currency a wallet is held in, so a group total
		 * can be rendered in the workspace currency.
		 *
		 * This is the only read path that converts. It has to: a balance is
		 * a live figure in its wallet's own currency, with no `base_amount`
		 * to sum. Transaction totals never come through here.
		 */
		rates: await walletRates(rows, me.workspace.currency_code, token)
	};
};

/**
 * The agent settings, or null when they could not be read.
 *
 * Null rather than defaults, and the tab says so rather than showing an
 * empty form. Rendering "nothing set" over a read that failed invites an
 * admin to save that over instructions which are actually in force.
 *
 * The other three reads on this page are not guarded: without wallets or
 * categories there is no settings page to show. This one is a tab.
 */
async function readAssistant(token?: string): Promise<chat.AgentSettings | null> {
	try {
		return (await chat.readSettings(token)).data ?? null;
	} catch {
		return null;
	}
}

async function walletRates(
	wallets: ledger.Wallet[],
	base: string,
	token?: string
): Promise<Record<string, string>> {
	const foreign = [...new Set(wallets.map((w) => w.currency_code))].filter(
		(code) => code !== base
	);
	if (foreign.length === 0) return {};

	const today = new Date().toISOString().slice(0, 10);
	const rates: Record<string, string> = {};

	await Promise.all(
		foreign.map(async (code) => {
			try {
				const result = await ledger.fxRate(code, base, today, token);
				if (result.data) rates[code] = result.data.rate;
			} catch {
				// A missing rate leaves that wallet out of the group total, and
				// the page says so. Refusing to render the whole screen because
				// one rate is unavailable would be worse.
			}
		})
	);

	return rates;
}

/** Everything a settings form can do. Each one re-reads nothing: the page reloads. */
export const actions: Actions = {
	createWallet: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.createWallet(
				{
					name: text(form, 'name'),
					group_id: optional(form, 'group_id'),
					currency_code: optional(form, 'currency_code'),
					is_included_in_totals: form.get('is_included_in_totals') !== 'false'
				},
				locals.accessToken
			)
		),

	updateWallet: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateWallet(
				text(form, 'id'),
				{
					name: text(form, 'name'),
					// An empty select means "no group", which is a null rather
					// than an absent key: the two mean different things to the
					// API, and only one of them detaches the wallet.
					group_id: optional(form, 'group_id'),
					currency_code: optional(form, 'currency_code'),
					is_included_in_totals: form.get('is_included_in_totals') !== 'false'
				},
				locals.accessToken
			)
		),

	/**
	 * Swap a wallet with its neighbour.
	 *
	 * The swap happens here rather than in the browser because reordering is
	 * two writes, and a form submits once. The list is re-read so positions
	 * are derived from what the API actually holds, not from what the page
	 * was rendered with.
	 */
	moveWallet: async ({ request, locals }) =>
		run(request, async (form) => {
			const wallets = (await ledger.listWallets(locals.accessToken)).data ?? [];
			await swap(
				wallets.filter((wallet) => wallet.group_id === optional(form, 'group_id')),
				text(form, 'id'),
				text(form, 'direction'),
				(id, sort_order) => ledger.updateWallet(id, { sort_order }, locals.accessToken)
			);
		}),

	setDefaultWallet: async ({ request, locals }) =>
		run(request, (form) => ledger.setDefaultWallet(text(form, 'id'), locals.accessToken)),

	deleteWallet: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteWallet(text(form, 'id'), locals.accessToken)),

	createGroup: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.createWalletGroup({ name: text(form, 'name') }, locals.accessToken)
		),

	updateGroup: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateWalletGroup(
				text(form, 'id'),
				{ name: text(form, 'name') },
				locals.accessToken
			)
		),

	deleteGroup: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteWalletGroup(text(form, 'id'), locals.accessToken)),

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
