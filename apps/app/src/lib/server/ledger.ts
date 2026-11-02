/**
 * Typed calls to the ledger endpoints.
 *
 * Server only, like everything under `src/lib/server`. The browser never
 * talks to the API (D5), so a route's `load` or form action calls these and
 * passes plain data down to the page.
 *
 * Every money field is a string on the way in and on the way out. Parsing
 * one into a JavaScript number is a bug (D12), so no function here returns
 * one.
 */

import { api, type Envelope } from './api';

export type Role = 'owner' | 'admin' | 'member';

export type Wallet = {
	id: string;
	group_id: string | null;
	group_name: string | null;
	name: string;
	currency_code: string;
	/** A decimal string, in this wallet's own currency (WAL-2). */
	balance: string;
	is_included_in_totals: boolean;
	is_default: boolean;
	sort_order: number;
};

export type WalletGroup = {
	id: string;
	name: string;
	sort_order: number;
};

export type Category = {
	id: string;
	name: string;
	type: 'income' | 'expense';
	sort_order: number;
};

export type Transaction = {
	id: string;
	wallet_id: string;
	wallet_name: string;
	wallet_currency_code: string;
	to_wallet_id: string | null;
	to_wallet_name: string | null;
	category_id: string | null;
	category_name: string | null;
	amount: string;
	to_amount: string | null;
	original_amount: string | null;
	original_currency_code: string | null;
	exchange_rate: string | null;
	base_amount: string;
	base_rate: string;
	base_rate_source: 'same' | 'user' | 'live' | 'cache';
	base_rate_date: string;
	/** True when the row was written on a cached rate from another day. */
	base_rate_is_stale: boolean;
	date: string;
	type: 'income' | 'expense' | 'transfer';
	name: string | null;
	description: string | null;
	is_ready: boolean;
	is_exported: boolean;
	source: 'web' | 'chat' | 'import' | 'receipt';
	created_at: string;
};

export type HistoryEntry = {
	id: string;
	action: string;
	source: string;
	actor_email: string;
	actor_name: string | null;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	created_at: string;
};

export type Summary = {
	currency_code: string;
	by_type: Array<{ type: string; total: string; count: number }>;
	by_category: Array<{
		category_id: string | null;
		category_name: string | null;
		type: string;
		total: string;
	}>;
};

export type PageMeta = {
	page: number;
	limit: number;
	total: number;
	total_pages: number;
};

export type BulkResult = {
	created: number;
	duplicates: number;
	skipped: Array<{ index: number; code: string; reason: string }>;
};

/** Every list filter, exactly as it appears in the page's own URL (TXN-9). */
export type TransactionQuery = {
	wallet_id?: string;
	category_id?: string;
	type?: string;
	start_date?: string;
	end_date?: string;
	search?: string;
	is_ready?: string;
	sort?: string;
	order?: string;
	page?: string;
	limit?: string;
};

/**
 * The filter keys the API accepts.
 *
 * Named here rather than spread across callers so a parameter the page uses
 * for its own purposes, such as an open sheet, is never forwarded.
 */
export const TRANSACTION_FILTER_KEYS = [
	'wallet_id',
	'category_id',
	'type',
	'start_date',
	'end_date',
	'search',
	'is_ready',
	'sort',
	'order',
	'page',
	'limit'
] as const;

/** Copy only the filter parameters out of a page URL. */
export function filterParams(url: URL): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of TRANSACTION_FILTER_KEYS) {
		const value = url.searchParams.get(key);
		if (value) params.set(key, value);
	}
	return params;
}

// ------------------------------------------------------------------ reads

export function listWallets(token?: string): Promise<Envelope<Wallet[]>> {
	return api<Wallet[]>({ path: '/v1/wallets', token });
}

export function listWalletGroups(token?: string): Promise<Envelope<WalletGroup[]>> {
	return api<WalletGroup[]>({ path: '/v1/wallet-groups', token });
}

export function listCategories(token?: string): Promise<Envelope<Category[]>> {
	return api<Category[]>({ path: '/v1/categories', token });
}

export function listTransactions(
	query: URLSearchParams,
	token?: string
): Promise<Envelope<Transaction[]>> {
	return api<Transaction[]>({ path: '/v1/transactions', query, token });
}

export function readTransaction(id: string, token?: string): Promise<Envelope<Transaction>> {
	return api<Transaction>({ path: `/v1/transactions/${id}`, token });
}

export function transactionSummary(
	query: URLSearchParams,
	token?: string
): Promise<Envelope<Summary>> {
	return api<Summary>({ path: '/v1/transactions/summary', query, token });
}

export function transactionHistory(
	id: string,
	token?: string
): Promise<Envelope<HistoryEntry[]>> {
	return api<HistoryEntry[]>({ path: `/v1/transactions/${id}/history`, token });
}

export function fxRate(
	from: string,
	to: string,
	date: string,
	token?: string
): Promise<Envelope<{ from: string; to: string; rate: string; source: string; date: string }>> {
	const query = new URLSearchParams({ from, to, date });
	return api({ path: '/v1/fx/rate', query, token });
}

// ----------------------------------------------------------------- writes

export type TransactionPayload = {
	type: 'income' | 'expense' | 'transfer';
	wallet_id: string;
	to_wallet_id?: string | null;
	category_id?: string | null;
	amount: string;
	to_amount?: string | null;
	original_amount?: string | null;
	original_currency_code?: string | null;
	exchange_rate?: string | null;
	base_rate?: string | null;
	date: string;
	name?: string | null;
	description?: string | null;
	is_ready?: boolean;
};

export function createTransaction(body: TransactionPayload, token?: string) {
	return api<Transaction>({ method: 'POST', path: '/v1/transactions', body, token });
}

export function updateTransaction(id: string, body: TransactionPayload, token?: string) {
	return api<Transaction>({ method: 'PATCH', path: `/v1/transactions/${id}`, body, token });
}

export function deleteTransaction(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/transactions/${id}`, token });
}

export function createTransactions(transactions: TransactionPayload[], token?: string) {
	return api<BulkResult>({
		method: 'POST',
		path: '/v1/transactions/bulk',
		body: { transactions },
		token
	});
}

export type ColumnMapping = {
	date?: string | null;
	name?: string | null;
	description?: string | null;
	amount?: string | null;
	amount_out?: string | null;
	amount_in?: string | null;
	currency?: string | null;
	category?: string | null;
};

/**
 * Commit a file's rows (TXN-11).
 *
 * The rows go across as the strings the file held. Every figure and every
 * date is parsed in Rust, because that is where a decimal point cannot
 * move (D28).
 */
export function importRows(
	body: {
		wallet_id: string;
		mapping: ColumnMapping;
		rows: Array<Record<string, string>>;
		categories: Record<string, string>;
	},
	token?: string
) {
	return api<BulkResult>({
		method: 'POST',
		path: '/v1/transactions/import/csv',
		body,
		token
	});
}

export function bulkUpdateTransactions(
	body: { ids: string[]; category_id?: string | null; is_ready?: boolean },
	token?: string
) {
	return api<{ affected: number }>({
		method: 'POST',
		path: '/v1/transactions/bulk-update',
		body,
		token
	});
}

export function bulkDeleteTransactions(ids: string[], token?: string) {
	return api<{ affected: number }>({
		method: 'POST',
		path: '/v1/transactions/bulk-delete',
		body: { ids },
		token
	});
}

export function createWallet(
	body: {
		name: string;
		group_id?: string | null;
		currency_code?: string | null;
		is_included_in_totals?: boolean;
		sort_order?: number;
	},
	token?: string
) {
	return api<Wallet>({ method: 'POST', path: '/v1/wallets', body, token });
}

export function updateWallet(
	id: string,
	body: Record<string, unknown>,
	token?: string
) {
	return api<Wallet>({ method: 'PATCH', path: `/v1/wallets/${id}`, body, token });
}

export function setDefaultWallet(id: string, token?: string) {
	return api<Wallet>({ method: 'POST', path: `/v1/wallets/${id}/set-default`, token });
}

export function deleteWallet(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/wallets/${id}`, token });
}

export function createWalletGroup(body: { name: string; sort_order?: number }, token?: string) {
	return api<WalletGroup>({ method: 'POST', path: '/v1/wallet-groups', body, token });
}

export function updateWalletGroup(
	id: string,
	body: { name?: string; sort_order?: number },
	token?: string
) {
	return api<WalletGroup>({ method: 'PATCH', path: `/v1/wallet-groups/${id}`, body, token });
}

export function deleteWalletGroup(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/wallet-groups/${id}`, token });
}

export function createCategory(
	body: { name: string; type: string; sort_order?: number },
	token?: string
) {
	return api<Category>({ method: 'POST', path: '/v1/categories', body, token });
}

export function updateCategory(id: string, body: Record<string, unknown>, token?: string) {
	return api<Category>({ method: 'PATCH', path: `/v1/categories/${id}`, body, token });
}

export function deleteCategory(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/categories/${id}`, token });
}
