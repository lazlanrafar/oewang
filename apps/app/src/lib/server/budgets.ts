/**
 * The budget endpoints (BUD-1 to BUD-3, D103).
 *
 * Every figure on the page arrives computed: totals, remaining, the
 * percentage and its state are the API's (D12, D27). Money goes out as a
 * decimal string.
 */

import type { BudgetStatus } from '$lib/reports';

import { api, type Envelope } from './api';

export type Budget = {
	id: string;
	category_id: string;
	amount: string;
	created_at: string;
	updated_at: string;
};

/** `month`, `search`, `sort` and `order`, passed straight through. */
export function budgetStatus(query: URLSearchParams, token?: string): Promise<Envelope<BudgetStatus>> {
	return api<BudgetStatus>({ path: '/v1/budgets', query, token });
}

export function createBudget(body: { category_id: string; amount: string }, token?: string) {
	return api<Budget>({ method: 'POST', path: '/v1/budgets', body, token });
}

export function updateBudget(id: string, body: { amount: string }, token?: string) {
	return api<Budget>({ method: 'PATCH', path: `/v1/budgets/${encodeURIComponent(id)}`, body, token });
}

export function deleteBudget(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/budgets/${encodeURIComponent(id)}`, token });
}
