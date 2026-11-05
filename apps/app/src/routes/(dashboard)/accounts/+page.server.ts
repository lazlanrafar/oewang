import { fail, type Actions } from '@sveltejs/kit';

import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { ApiError } from '$lib/server/api';
import * as ledger from '$lib/server/ledger';
import { walletTotals } from '$lib/wallets';

import type { PageServerLoad } from './$types';

/**
 * The accounts screen (WAL-1 to WAL-6).
 *
 * Wallets, their groups and the rates a multi-currency total needs, read
 * together: none of the three depends on another, and the page cannot
 * render until all three have answered.
 *
 * The search lives in the URL, so a filtered view can be shared and
 * restored (UI-8, D55). It is applied here rather than in the browser for
 * the same reason the transactions list is: the page shows what the server
 * matched, and filtering twice is two rules to keep in step.
 */
export const load: PageServerLoad = async ({ depends, locals, url, parent }) => {
	const token = locals.accessToken;
	const { me } = await parent();
	const base = me.workspace.currency_code;

	depends(INVALIDATION_KEYS.wallets, INVALIDATION_KEYS.walletBalances);

	const [wallets, groups] = await Promise.all([
		ledger.listWallets(token),
		ledger.listWalletGroups(token)
	]);

	const all = wallets.data ?? [];
	const rates = await ledger.walletRates(all, base, token);

	const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
	const groupIds = url.searchParams.getAll('group_id').filter(Boolean);

	const rows = all.filter((wallet) => {
		if (search && !wallet.name.toLowerCase().includes(search)) return false;
		// An explicit "none" matches the wallets in no group at all, which is
		// otherwise unreachable: a null has no id to put in a query string.
		if (groupIds.length > 0) {
			const key = wallet.group_id ?? 'none';
			if (!groupIds.includes(key)) return false;
		}
		return true;
	});

	return {
		wallets: rows,
		groups: groups.data ?? [],
		rates,
		baseCurrency: base,
		// The cards describe the workspace, not the filtered view: a search
		// narrows the table, and a total that moved with it would read as
		// money having disappeared.
		totals: walletTotals(all, base, rates),
		filtered: search !== '' || groupIds.length > 0
	};
};

/**
 * Everything the screen can do, as form actions.
 *
 * A form action rather than a fetch, so every one of these works with
 * JavaScript off and so the page reloads from the server afterwards rather
 * than guessing what changed.
 */
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

	/** One field from the table's own cell, so the rest of the row is untouched. */
	setGroup: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateWallet(
				text(form, 'id'),
				{ group_id: optional(form, 'group_id') },
				locals.accessToken
			)
		),

	setDefaultWallet: async ({ request, locals }) =>
		run(request, (form) => ledger.setDefaultWallet(text(form, 'id'), locals.accessToken)),

	deleteWallet: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteWallet(text(form, 'id'), locals.accessToken)),

	/**
	 * Type a balance, and the API writes the transaction that explains it.
	 *
	 * The column itself is never written (TXN-3, and the rule at
	 * docs/api/endpoints.md). What the reader typed is the target; the
	 * difference arrives as one "Balance adjustment" row.
	 */
	adjustBalance: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.adjustWalletBalance(text(form, 'id'), text(form, 'balance'), locals.accessToken)
		),

	createGroup: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.createWalletGroup({ name: text(form, 'name') }, locals.accessToken)
		),

	updateGroup: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateWalletGroup(text(form, 'id'), { name: text(form, 'name') }, locals.accessToken)
		),

	deleteGroup: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteWalletGroup(text(form, 'id'), locals.accessToken))
};

async function run(request: Request, call: (form: FormData) => Promise<unknown>) {
	const form = await request.formData();

	try {
		// The created row travels back, so a picker that just made one can
		// select it without a second round trip to look it up by name.
		const data = await call(form);
		return { ok: true, data };
	} catch (error) {
		if (error instanceof ApiError) {
			return fail(error.status, { code: error.code, fields: error.fields });
		}
		throw error;
	}
}

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}

/** An empty field is `null`, never `''`: the API tells the two apart. */
function optional(form: FormData, key: string): string | null {
	const value = text(form, key);
	return value === '' ? null : value;
}
