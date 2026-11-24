/**
 * Debt helpers the browser may run (DEBT-11 to DEBT-13, D120).
 *
 * Every figure a card or a row shows is the API's, `paid_amount` and
 * `overdue` included (D27). What lives here is the reader's own date, which
 * the page sends as `?today=`, a bar's width, a contact's totals per
 * currency, and the payment sheet's rate prefill. Money stays a decimal
 * string throughout (D12).
 */
import { addDecimals, chartValue, compareDecimals, divideDecimals } from '$lib/money';

export const DEBT_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export const DEBT_TYPES = ['receivable', 'payable'] as const;
export const DEBT_SORTS = ['due_date', 'amount', 'remaining', 'created_at', 'contact'] as const;

type DebtLike = {
	type: 'payable' | 'receivable';
	currency_code: string;
	amount: string;
	remaining_amount: string;
	paid_amount: string;
};

/** The reader's own date, `YYYY-MM-DD`, not the server's UTC one. */
export function localToday(now = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The share paid, 0 to 100, for a progress bar's width only. Geometry, so
 * a float is fine here; no label reads it (D89).
 */
export function paidPercent(debt: Pick<DebtLike, 'amount' | 'paid_amount'>): number {
	if (compareDecimals(debt.amount, '0') <= 0) return 0;
	return Math.min(100, Math.max(0, chartValue(divideDecimals(debt.paid_amount, debt.amount, 4)) * 100));
}

/**
 * The remaining amount, of one type or of every debt given, per currency,
 * in the order first seen.
 *
 * A contact can owe in two currencies, and adding rupiah to dollars is the
 * one sum this must never make, so each currency keeps its own total.
 */
export function remainingByCurrency(
	debts: Pick<DebtLike, 'type' | 'currency_code' | 'remaining_amount'>[],
	type?: 'payable' | 'receivable'
): Array<{ currency: string; total: string }> {
	const totals = new Map<string, string[]>();
	for (const debt of debts) {
		if (type && debt.type !== type) continue;
		totals.set(debt.currency_code, [...(totals.get(debt.currency_code) ?? []), debt.remaining_amount]);
	}
	return [...totals].map(([currency, values]) => ({ currency, total: addDecimals(values) }));
}

/**
 * One unit of `from` in `to`, worked out through the workspace currency from
 * the newest daily snapshot, or null when either rate is missing. A prefill
 * the person may change (D39); the same reading the transaction form makes.
 */
export function crossRate(
	rates: Map<string, string>,
	base: string,
	from: string,
	to: string
): string | null {
	if (from === to) return '1';
	const fromRate = from === base ? '1' : rates.get(from);
	const toRate = to === base ? '1' : rates.get(to);
	if (!fromRate || !toRate) return null;
	try {
		const rate = to === base ? fromRate : divideDecimals(fromRate, toRate);
		return rate.includes('.') ? rate.replace(/0+$/, '').replace(/\.$/, '') : rate;
	} catch {
		return null;
	}
}
