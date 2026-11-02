import { fail, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import * as ledger from '$lib/server/ledger';
import type { PageServerLoad } from './$types';

/**
 * Wallets, their groups and categories, loaded together.
 *
 * Three reads in parallel rather than in sequence: they do not depend on
 * each other, and the page cannot render until all three have answered.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const token = locals.accessToken;
	const { me } = await parent();

	const [wallets, groups, categories] = await Promise.all([
		ledger.listWallets(token),
		ledger.listWalletGroups(token),
		ledger.listCategories(token)
	]);

	const rows = wallets.data ?? [];

	return {
		wallets: rows,
		groups: groups.data ?? [],
		categories: categories.data ?? [],
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
		run(request, (form) => ledger.deleteCategory(text(form, 'id'), locals.accessToken))
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
