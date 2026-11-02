import { fail, type Actions } from '@sveltejs/kit';

import { ApiError } from '$lib/server/api';
import * as ledger from '$lib/server/ledger';

import type { PageServerLoad } from './$types';

/**
 * The transactions list (US-017).
 *
 * Every filter comes out of the URL and goes straight to the API, so a
 * refresh, the back button and a pasted link all reproduce the same view
 * (TXN-9, UI-8, D55). Nothing is filtered in the browser.
 */
export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const token = locals.accessToken;
	const query = ledger.filterParams(url);
	const { me } = await parent();
	const workspaceCurrency = me.workspace.currency_code;

	const [transactions, wallets, categories] = await Promise.all([
		ledger.listTransactions(query, token),
		ledger.listWallets(token),
		ledger.listCategories(token)
	]);

	// A rate suggestion for the form, only when the default wallet is held in
	// a currency other than the workspace's (TXN-20).
	const walletRows = wallets.data ?? [];
	const defaultWallet = walletRows.find((wallet) => wallet.is_default) ?? walletRows[0];
	const suggestion =
		defaultWallet && defaultWallet.currency_code !== workspaceCurrency
			? await suggestRate(defaultWallet.currency_code, workspaceCurrency, token)
			: null;

	return {
		transactions: transactions.data ?? [],
		suggestedRate: suggestion,
		meta: transactions.meta,
		wallets: wallets.data ?? [],
		categories: categories.data ?? [],
		/** True when the view is filtered, which decides the empty state. */
		filtered: [...query.keys()].some(
			(key) => !['page', 'limit', 'sort', 'order'].includes(key)
		)
	};
};

/**
 * Today's rate for a pair, or null.
 *
 * A suggestion for the form and nothing else: the rate the user confirms is
 * what gets stored (D39). A missing rate is not an error here, because the
 * form accepts a typed one.
 */
async function suggestRate(
	from: string,
	to: string,
	token?: string
): Promise<string | null> {
	try {
		const today = new Date().toISOString().slice(0, 10);
		const result = await ledger.fxRate(from, to, today, token);
		return result.data?.rate ?? null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	create: async ({ request, locals }) =>
		run(request, (form) => ledger.createTransaction(payload(form), locals.accessToken)),

	update: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.updateTransaction(text(form, 'id'), payload(form), locals.accessToken)
		),

	delete: async ({ request, locals }) =>
		run(request, (form) => ledger.deleteTransaction(text(form, 'id'), locals.accessToken)),

	/**
	 * An in-cell category change.
	 *
	 * Its own action rather than a full update, because the cell knows one
	 * field and sending the rest would mean reconstructing a row the user
	 * never touched.
	 */
	setCategory: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.bulkUpdateTransactions(
				{ ids: [text(form, 'id')], category_id: optional(form, 'category_id') },
				locals.accessToken
			)
		),

	bulkUpdate: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.bulkUpdateTransactions(
				{
					ids: ids(form),
					...(form.has('category_id') ? { category_id: optional(form, 'category_id') } : {}),
					...(form.has('is_ready') ? { is_ready: form.get('is_ready') === 'true' } : {})
				},
				locals.accessToken
			)
		),

	bulkDelete: async ({ request, locals }) =>
		run(request, (form) => ledger.bulkDeleteTransactions(ids(form), locals.accessToken))
};

/**
 * Build the API payload from the form.
 *
 * Amounts travel as the strings the inputs hold. Nothing here parses one
 * into a number, which is the whole point of the form holding strings in
 * the first place (D12).
 */
function payload(form: FormData): ledger.TransactionPayload {
	const type = text(form, 'type') as ledger.TransactionPayload['type'];
	const transfer = type === 'transfer';

	return {
		type,
		wallet_id: text(form, 'wallet_id'),
		to_wallet_id: transfer ? optional(form, 'to_wallet_id') : null,
		category_id: transfer ? null : optional(form, 'category_id'),
		amount: text(form, 'amount'),
		to_amount: transfer ? optional(form, 'to_amount') : null,
		original_amount: optional(form, 'original_amount'),
		original_currency_code: optional(form, 'original_currency_code'),
		exchange_rate: optional(form, 'exchange_rate'),
		base_rate: optional(form, 'base_rate'),
		// The date input holds a day; the API wants an instant, and midday
		// local time keeps a row on the day the user picked whatever the
		// viewer's offset is.
		date: new Date(`${text(form, 'date')}T12:00:00`).toISOString(),
		name: optional(form, 'name'),
		description: optional(form, 'description'),
		is_ready: form.get('is_ready') === 'true'
	};
}

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

function text(form: FormData, key: string): string {
	return String(form.get(key) ?? '').trim();
}

function optional(form: FormData, key: string): string | null {
	const value = text(form, key);
	return value === '' ? null : value;
}

function ids(form: FormData): string[] {
	return text(form, 'ids')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
}
