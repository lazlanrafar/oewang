import { fail, type Actions } from '@sveltejs/kit';

import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { ApiError } from '$lib/server/api';
import { currentMonth } from '$lib/month-range';
import * as ledger from '$lib/server/ledger';
import * as vault from '$lib/server/vault';

import type { PageServerLoad } from './$types';

/**
 * The transactions list (US-017).
 *
 * Every filter comes out of the URL and goes straight to the API, so a
 * refresh, the back button and a pasted link all reproduce the same view
 * (TXN-9, UI-8, D55). Nothing is filtered in the browser.
 */
export const load: PageServerLoad = async ({ depends, locals, url, parent }) => {
	const token = locals.accessToken;
	const query = ledger.filterParams(url);

	// The list opens on the current month, as the live app does, rather than
	// on everything ever recorded. The default is applied here rather than
	// written into the URL, so an empty address bar still means "this
	// month" and a link that names a range still wins.
	if (!query.has('start_date') && !query.has('end_date')) {
		const month = currentMonth();
		query.set('start_date', month.start);
		query.set('end_date', month.end);
	}

	// What a chat write makes stale here (D32, CHAT-12). The map lives in
	// $lib/chat-invalidation; this is the end that declares the data. The
	// wallets and categories loaded below are both the filter's options and
	// the balances a transaction moved.
	depends(
		INVALIDATION_KEYS.transactions,
		INVALIDATION_KEYS.transactionDetail,
		INVALIDATION_KEYS.transactionFilters,
		INVALIDATION_KEYS.walletBalances
	);
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

	// The row the detail sheet is showing, with its audit history. Loaded
	// here rather than fetched from the browser, because the browser never
	// calls the API (D5), and because `?detail=` is a URL the user can share.
	const detailId = url.searchParams.get('detail');
	// The row the form sheet is editing, for its attachments. The list rows
	// do not carry them, and the form saves the whole set every time, so a
	// sheet that opened without them would detach every file (TXN-13).
	const sheetId = url.searchParams.get('sheet');
	const editId = sheetId && sheetId !== 'new' ? sheetId : null;
	const [detail, editing] = await Promise.all([
		detailId ? loadDetail(detailId, token) : null,
		editId && editId !== detailId ? loadEditing(editId, token) : null
	]);

	return {
		transactions: transactions.data ?? [],
		suggestedRate: suggestion,
		detail,
		editing: editing ?? (detail && detail.transaction.id === editId ? detail.transaction : null),
		// The receipt the canvas is open on, so the panel can name the file
		// and the manual form can carry it as an attachment (AI-3).
		canvasFile: await loadCanvasFile(url, token),
		// The file sheet a tile opened, stacked over the detail sheet (VLT-10).
		file: await loadVaultFile(url.searchParams.get('file'), token),
		meta: transactions.meta,
		wallets: wallets.data ?? [],
		categories: categories.data ?? [],
		/** True when the view is filtered, which decides the empty state. */
		/**
		 * What makes this a different list rather than more of the same one.
		 *
		 * The browser accumulates rows as it scrolls, so it has to tell a
		 * page step from a filter change, and both arrive as a new load. The
		 * key is built here because this is where the query the API was
		 * actually asked is known, defaults included.
		 */
		filterKey: [...query.entries()]
			.filter(([key]) => key !== 'page' && key !== 'limit')
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, value]) => `${key}=${value}`)
			.join('&'),
		// Read from the URL, not from `query`: the load defaults a date range
		// into the latter, and a fresh account would then be told "nothing
		// matches" when what it means is "nothing yet" (UI-2).
		filtered: [...ledger.filterParams(url).keys()].some(
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

/**
 * The vault file `?canvas=…&id=…` points at, or null.
 *
 * Read here rather than in the browser, which has no way to ask (D5). A
 * file that has gone leaves this null and the panel says so rather than
 * failing the page.
 */
async function loadCanvasFile(url: URL, token?: string) {
	const id = url.searchParams.get('canvas') ? (url.searchParams.get('id') ?? '') : '';
	if (id === '') return null;

	try {
		return (await vault.readFile(id, token)).data ?? null;
	} catch {
		return null;
	}
}

/** The file `?file=` names, or null when it is gone (D90). */
async function loadVaultFile(id: string | null, token?: string) {
	if (!id) return null;
	try {
		return (await vault.readFile(id, token)).data ?? null;
	} catch {
		return null;
	}
}

/**
 * One transaction and its history, or null when the id is stale.
 *
 * A link to a row that has since been deleted opens the page rather than
 * an error: the row is gone, which is the answer.
 */
async function loadEditing(id: string, token?: string) {
	try {
		return (await ledger.readTransaction(id, token)).data ?? null;
	} catch {
		return null;
	}
}

async function loadDetail(id: string, token?: string) {
	try {
		const [transaction, history] = await Promise.all([
			ledger.readTransaction(id, token),
			ledger.transactionHistory(id, token)
		]);
		if (!transaction.data) return null;
		return { transaction: transaction.data, history: history.data ?? [] };
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

	/**
	 * An in-cell account change.
	 *
	 * Not part of `bulkUpdate`, which only touches fields that move no
	 * money. Changing the account moves the amount off one wallet and onto
	 * another, and the balances, the locking order and the audit row for
	 * that already live behind `PATCH /v1/transactions/:id`. So the row is
	 * read and sent back with one field changed, rather than that work being
	 * written a second time against the bulk path.
	 */
	setWallet: async ({ request, locals }) =>
		run(request, (form) =>
			resave(text(form, 'id'), { wallet_id: text(form, 'wallet_id') }, locals.accessToken)
		),

	/**
	 * The detail sheet's attachments, saved as soon as they change.
	 *
	 * The whole set, as the form sheet sends it: one hidden input per file,
	 * so an empty set means "none" rather than "leave them alone" (TXN-13).
	 */
	setAttachments: async ({ request, locals }) =>
		run(request, (form) =>
			resave(
				text(form, 'id'),
				{
					attachment_ids: form
						.getAll('attachment_ids')
						.map((value) => String(value))
						.filter(Boolean)
				},
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
		run(request, (form) => ledger.bulkDeleteTransactions(ids(form), locals.accessToken)),

	/**
	 * Confirm what the model read off a receipt (AI-2, CHAT-13).
	 *
	 * The draft was never persisted, so this is an ordinary create through
	 * the same service every other write here uses: the receipt's file
	 * travels as an attachment, and the line items follow it, because
	 * `POST /v1/transactions` takes attachments but not items.
	 *
	 * It lives on this page rather than on the chat page because this is
	 * where transactions are written. The chat canvas posts here, so both
	 * surfaces confirm a receipt the same way rather than twice.
	 *
	 * **One call.** The row, its line items and its attachment are written
	 * in the same database transaction, so a confirmed receipt either
	 * happens whole or does not happen. `source: 'receipt'` is what makes
	 * the audit row name the surface it came from (OPS-1, D14).
	 */
	confirmReceipt: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.createTransaction(
				{
					type: 'expense',
					source: 'receipt',
					wallet_id: text(form, 'wallet_id'),
					to_wallet_id: null,
					category_id: optional(form, 'category_id'),
					amount: text(form, 'amount'),
					date: new Date(`${text(form, 'date')}T12:00:00`).toISOString(),
					name: optional(form, 'name'),
					is_ready: false,
					items: receiptItems(form),
					attachment_ids: form
						.getAll('attachment_ids')
						.map((value) => String(value))
						.filter(Boolean)
				},
				locals.accessToken
			)
		),

	// ------------------------------------------------------- line items

	addItem: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.addItem(text(form, 'transaction_id'), itemBody(form), locals.accessToken)
		),

	saveItem: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.replaceItem(
				text(form, 'transaction_id'),
				text(form, 'item_id'),
				itemBody(form),
				locals.accessToken
			)
		),

	deleteItem: async ({ request, locals }) =>
		run(request, (form) =>
			ledger.deleteItem(
				text(form, 'transaction_id'),
				text(form, 'item_id'),
				locals.accessToken
			)
		)
};

/**
 * Save a row back with some fields changed.
 *
 * An account change moves the amount off one wallet and onto another, and
 * the balances, the locking order and the audit row for that already live
 * behind `PATCH /v1/transactions/:id`. So the row is read and sent back
 * with the change applied, rather than that work being written a second
 * time against the bulk path. Attachments go the same way, because the
 * bulk path does not carry them.
 */
async function resave(
	id: string,
	change: Partial<ledger.TransactionPayload>,
	token?: string
) {
	const current = await ledger.readTransaction(id, token);
	const row = current.data;
	if (!row) throw new Error('NOT_FOUND');

	return ledger.updateTransaction(
		id,
		{
			type: row.type,
			wallet_id: row.wallet_id,
			to_wallet_id: row.to_wallet_id,
			category_id: row.category_id,
			amount: row.amount,
			to_amount: row.to_amount,
			original_amount: row.original_amount,
			original_currency_code: row.original_currency_code,
			exchange_rate: row.exchange_rate,
			date: row.date,
			name: row.name,
			description: row.description,
			is_ready: row.is_ready,
			...change
		},
		token
	);
}

/**
 * A receipt's line items, as the confirmation panel submitted them.
 *
 * One JSON field rather than one form field per line: the number of lines
 * belongs to the receipt, not to the form. Every figure stays the string
 * the panel held (D12); nothing here reads one.
 */
function receiptItems(form: FormData): ledger.TransactionItemPayload[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(String(form.get('items') ?? '[]'));
	} catch {
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	return parsed
		.filter(
			(entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
		)
		.map((entry) => ({
			name: typeof entry.name === 'string' ? entry.name : '',
			quantity: typeof entry.quantity === 'string' ? entry.quantity : null,
			unit_price: typeof entry.unit_price === 'string' ? entry.unit_price : null,
			amount: typeof entry.amount === 'string' ? entry.amount : ''
		}))
		.filter((item) => item.amount !== '');
}

/** A line item, with every figure still a string (D12). */
function itemBody(form: FormData): Record<string, unknown> {
	return {
		name: text(form, 'name'),
		brand: optional(form, 'brand'),
		quantity: optional(form, 'quantity'),
		unit: optional(form, 'unit'),
		unit_price: optional(form, 'unit_price'),
		amount: text(form, 'amount'),
		category_id: optional(form, 'category_id'),
		notes: optional(form, 'notes')
	};
}

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
		is_ready: form.get('is_ready') === 'true',
		// The whole set, every time the sheet saves. The dropzone renders
		// one hidden input per file, so an empty form means no attachments
		// rather than "leave them alone" (TXN-13).
		attachment_ids: form
			.getAll('attachment_ids')
			.map((value) => String(value))
			.filter(Boolean)
	};
}

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
