/**
 * The debt endpoints (DEBT-1 to DEBT-12, D120, D121).
 *
 * Money goes out and comes back as decimal strings (D12). `remaining_amount`
 * and `status` are the API's and are never sent (DEBT-2).
 */

import { api, type Envelope } from './api';
import { readContact } from './contacts';

export type DebtType = 'payable' | 'receivable';
export type DebtStatus = 'unpaid' | 'partial' | 'paid';

export type Debt = {
	id: string;
	contact_id: string;
	contact_name: string;
	type: DebtType;
	origin: 'manual' | 'from_transaction';
	currency_code: string;
	amount: string;
	remaining_amount: string;
	status: DebtStatus;
	description: string | null;
	/** `YYYY-MM-DD`, a day rather than an instant. */
	due_date: string | null;
	source_transaction_id: string | null;
	/** The source transaction's name, when the list carries it. */
	source_transaction_name?: string | null;
	created_at: string;
	updated_at: string;
};

export type DebtPayment = {
	id: string;
	debt_id: string;
	amount: string;
	date: string;
	transaction_id: string | null;
	wallet_id: string | null;
	wallet_name?: string | null;
	created_at: string;
};

export type DebtDetail = Debt & {
	payments: DebtPayment[];
	source_transaction?: { id: string; name: string | null } | null;
};

export type DebtSummary = {
	currency_code: string;
	owed_to_you: string;
	you_owe: string;
	net: string;
	overdue_count: number;
};

/** A debt tied to one transaction: made from it, or settled by it (DEBT-12). */
export type TransactionDebt = { debt: Debt; payment: DebtPayment | null };

export type DebtBody = {
	type?: DebtType;
	contact_id: string;
	amount: string;
	currency_code?: string;
	due_date?: string | null;
	description?: string | null;
	source_transaction_id?: string | null;
};

export type PaymentBody = {
	amount: string;
	wallet_id?: string | null;
	date: string;
	exchange_rate?: string | null;
};

export type BulkPayBody = {
	wallet_id?: string | null;
	date: string;
	payments: Array<{ debt_id: string; amount: string }>;
};

const path = (id: string) => `/v1/debts/${encodeURIComponent(id)}`;

/** Filters, sort and page, passed straight through. */
export function listDebts(query: URLSearchParams, token?: string): Promise<Envelope<Debt[]>> {
	return api<Debt[]>({ path: '/v1/debts', query, token });
}

export function debtSummary(query: URLSearchParams, token?: string): Promise<Envelope<DebtSummary>> {
	return api<DebtSummary>({ path: '/v1/debts/summary', query, token });
}

export function readDebt(id: string, token?: string): Promise<Envelope<DebtDetail>> {
	return api<DebtDetail>({ path: path(id), token });
}

export function createDebt(body: DebtBody, token?: string) {
	return api<Debt>({ method: 'POST', path: '/v1/debts', body, token });
}

export function updateDebt(id: string, body: Partial<DebtBody>, token?: string) {
	return api<Debt>({ method: 'PATCH', path: path(id), body, token });
}

export function deleteDebt(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: path(id), token });
}

export function payDebt(id: string, body: PaymentBody, token?: string) {
	return api<{ payment: DebtPayment; debt: Debt }>({
		method: 'POST',
		path: `${path(id)}/payments`,
		body,
		token
	});
}

export function cancelPayment(id: string, paymentId: string, token?: string) {
	return api<null>({
		method: 'DELETE',
		path: `${path(id)}/payments/${encodeURIComponent(paymentId)}`,
		token
	});
}

export function bulkPay(body: BulkPayBody, token?: string) {
	return api<unknown>({ method: 'POST', path: '/v1/debts/bulk-pay', body, token });
}

export function transactionDebts(id: string, token?: string): Promise<Envelope<TransactionDebt[]>> {
	return api<TransactionDebt[]>({ path: `/v1/transactions/${encodeURIComponent(id)}/debts`, token });
}

/**
 * The contact sheet's data, which both pages open through `?contact=`:
 * the contact and every debt with them (CON-2). Null when the id names
 * nothing, so a stale link closes the sheet rather than failing the page.
 *
 * shortcut: one page of 100 debts; a contact with more shows the newest 100.
 */
export async function contactSheet(id: string, token?: string) {
	try {
		const query = new URLSearchParams({
			contact_id: id,
			sort: 'created_at',
			order: 'desc',
			limit: '100'
		});
		const [contact, debts] = await Promise.all([readContact(id, token), listDebts(query, token)]);
		if (!contact.data) return null;
		return { contact: contact.data, debts: debts.data ?? [] };
	} catch {
		return null;
	}
}
