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
	created_at: string;
	updated_at: string;
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
	min_amount?: string;
	max_amount?: string;
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
	'min_amount',
	'max_amount',
	'sort',
	'order',
	'page',
	'limit'
] as const;

/** Copy only the filter parameters out of a page URL. */
export function filterParams(url: URL): URLSearchParams {
	const params = new URLSearchParams();
	for (const key of TRANSACTION_FILTER_KEYS) {
		// `getAll`, because a facet may hold several values and arrives as a
		// repeated parameter. A single value is the one-element case of the
		// same shape, so nothing special-cases it.
		for (const value of url.searchParams.getAll(key)) {
			if (value) params.append(key, value);
		}
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

export type TransactionDetail = Transaction & {
	items: TransactionItem[];
	attachments: Attachment[];
};

export function readTransaction(
	id: string,
	token?: string
): Promise<Envelope<TransactionDetail>> {
	return api<TransactionDetail>({ path: `/v1/transactions/${id}`, token });
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

/** A line item as `POST /v1/transactions` takes it. Every figure a string. */
export type TransactionItemPayload = {
	name: string;
	brand?: string | null;
	quantity?: string | null;
	unit?: string | null;
	unit_price?: string | null;
	amount: string;
	category_id?: string | null;
	notes?: string | null;
};

export type TransactionPayload = {
	/** The whole set of files, or absent to leave them alone (TXN-13). */
	attachment_ids?: string[];
	/**
	 * Line items, written in the same database transaction as the row, so
	 * a receipt is one call that either happens or does not. `PATCH`
	 * ignores this: editing an item goes through the item routes.
	 */
	items?: TransactionItemPayload[];
	/**
	 * Where the write came from, for the audit row (OPS-1, D14).
	 *
	 * Only `web` and `receipt` may be claimed; absent means `web`. The API
	 * mints `chat` and `import` on its own paths, so a client sending
	 * either is refused.
	 */
	source?: 'web' | 'receipt';
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

export type VaultFile = {
	id: string;
	name: string;
	size: number;
	type: string;
	sha256: string | null;
	status: 'pending' | 'ready';
};

export type BegunUpload = {
	id: string;
	chunk_size: number;
	chunk_count: number;
	status: string;
};

/**
 * Start an upload (VLT-1).
 *
 * Nothing is stored yet: the row exists so a chunk can be addressed, and
 * stays pending until the bytes have been checked against what was
 * declared.
 */
export function beginUpload(
	body: { filename: string; content_type: string; size_bytes: number },
	token?: string
) {
	return api<BegunUpload>({ method: 'POST', path: '/v1/vault/files', body, token });
}

/** One chunk, base64 inside the envelope. Never a signed URL (D23). */
export function putChunk(fileId: string, index: number, data: string, token?: string) {
	return api<null>({
		method: 'PUT',
		path: `/v1/vault/files/${fileId}/chunks/${index}`,
		body: { data },
		token
	});
}

export function completeUpload(fileId: string, token?: string) {
	return api<VaultFile>({
		method: 'POST',
		path: `/v1/vault/files/${fileId}/complete`,
		token
	});
}

export function readChunk(fileId: string, index: number, token?: string) {
	return api<{ index: number; data: string }>({
		path: `/v1/vault/files/${fileId}/chunks/${index}`,
		token
	});
}

export function readFile(fileId: string, token?: string) {
	return api<VaultFile>({ path: `/v1/vault/files/${fileId}`, token });
}

export type TransactionItem = {
	id: string;
	name: string;
	brand: string | null;
	quantity: string | null;
	unit: string | null;
	unit_price: string | null;
	amount: string;
	category_id: string | null;
	notes: string | null;
};

export type Attachment = {
	id: string;
	file_id: string;
	name: string;
	type: string;
	size: number;
};

export function addItem(
	transactionId: string,
	body: Record<string, unknown>,
	token?: string
) {
	return api<TransactionItem>({
		method: 'POST',
		path: `/v1/transactions/${transactionId}/items`,
		body,
		token
	});
}

export function replaceItem(
	transactionId: string,
	itemId: string,
	body: Record<string, unknown>,
	token?: string
) {
	return api<TransactionItem>({
		method: 'PUT',
		path: `/v1/transactions/${transactionId}/items/${itemId}`,
		body,
		token
	});
}

export function deleteItem(transactionId: string, itemId: string, token?: string) {
	return api<null>({
		method: 'DELETE',
		path: `/v1/transactions/${transactionId}/items/${itemId}`,
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

/**
 * Ask the AI service which column holds what (AI-9, D28).
 *
 * Column names and two sample rows go out and a mapping comes back. No
 * figure is sent and none comes back: every amount is parsed in Rust,
 * which is the whole reason this step maps names rather than extracting
 * rows.
 *
 * `signal` is what keeps the wizard moving. The call failing, timing out
 * or 404ing leaves step two empty and the user maps by hand, which is the
 * documented fallback rather than an error state.
 */
export function mapColumns(
	body: { columns: string[]; sample_rows: Array<Record<string, string>> },
	token?: string,
	signal?: AbortSignal
): Promise<Envelope<ColumnMapping>> {
	return api<ColumnMapping>({
		method: 'POST',
		path: '/v1/transactions/import/map-columns',
		body,
		token,
		signal
	});
}

/**
 * One asynchronous statement import (AI-4).
 *
 * The file is already in the vault, so this carries its id and the wallet
 * every row lands in: a statement is one account's statement, and a row
 * with no wallet moves no balance. The API answers `202` with a job id and
 * does the work in the background.
 */
export function startStatementImport(
	body: { vault_file_id: string; wallet_id: string },
	token?: string
) {
	return api<{ job_id: string }>({
		method: 'POST',
		path: '/v1/transactions/import',
		body,
		token
	});
}

export type ImportJobView = {
	id: string;
	status: 'pending' | 'succeeded' | 'failed';
	imported: number;
	skipped: number;
	duplicates: number;
	error: string | null;
	/** True once a pending job has been pending too long (P12). */
	stale: boolean;
	created_at: string;
	updated_at: string;
};

/** One poll. Readable by any role: watching an import is not a write. */
export function readImportJob(jobId: string, token?: string): Promise<Envelope<ImportJobView>> {
	return api<ImportJobView>({ path: `/v1/transactions/import/${jobId}`, token });
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

/**
 * One wallet, by id.
 *
 * The list carries `group_name`; this does not, because a single read does
 * no join. A caller that needs the name has the group list already.
 */
export function readWallet(id: string, token?: string): Promise<Envelope<Wallet>> {
	return api<Wallet>({ path: `/v1/wallets/${id}`, token });
}

/**
 * Move a balance to a figure by writing the transaction that explains it.
 *
 * `balance` is the target, not the difference. The API works out which way
 * it moved and records one adjustment; the column is never written
 * directly, because a balance is a consequence of transactions (TXN-3).
 */
export function adjustWalletBalance(
	id: string,
	balance: string,
	token?: string
): Promise<Envelope<Wallet>> {
	return api<Wallet>({
		method: 'POST',
		path: `/v1/wallets/${id}/adjust`,
		body: { balance },
		token
	});
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
