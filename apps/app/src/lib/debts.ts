/**
 * Debt helpers the browser may run (DEBT-11 to DEBT-13, D120).
 *
 * Every figure a card shows is the API's (D27). What lives here is what a
 * sheet needs between two loads: how much of a debt is paid, the totals a
 * contact's sheet prints, and whether a row is past its due date for the
 * reader's own calendar. Money stays a decimal string throughout (D12).
 */
import { addDecimals, chartValue, compareDecimals, divideDecimals, negate } from '$lib/money';

export const DEBT_STATUSES = ['unpaid', 'partial', 'paid'] as const;
export const DEBT_TYPES = ['receivable', 'payable'] as const;
export const DEBT_SORTS = ['due_date', 'amount', 'remaining', 'created_at', 'contact'] as const;

type DebtLike = {
	type: 'payable' | 'receivable';
	status: 'unpaid' | 'partial' | 'paid';
	currency_code: string;
	amount: string;
	remaining_amount: string;
	due_date: string | null;
};

/** The reader's own date, `YYYY-MM-DD`, not the server's UTC one. */
export function localToday(now = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	return `${now.getFullYear()}-${month}-${day}`;
}

/** Due before today and not settled. A date compares as text: both are `YYYY-MM-DD`. */
export function isOverdue(debt: Pick<DebtLike, 'status' | 'due_date'>, today: string): boolean {
	return debt.status !== 'paid' && debt.due_date !== null && debt.due_date.slice(0, 10) < today;
}

/** What has been paid so far: the amount less what remains. */
export function paidAmount(debt: Pick<DebtLike, 'amount' | 'remaining_amount'>): string {
	return addDecimals([debt.amount, negate(debt.remaining_amount)]);
}

/** Partly paid: something paid, something left. */
export function isPartlyPaid(debt: Pick<DebtLike, 'amount' | 'remaining_amount'>): boolean {
	return (
		compareDecimals(debt.remaining_amount, '0') > 0 &&
		compareDecimals(debt.remaining_amount, debt.amount) < 0
	);
}

/**
 * The share paid, 0 to 100, for a progress bar's width only. Geometry, so
 * a float is fine here; no label reads it (D89).
 */
export function paidPercent(debt: Pick<DebtLike, 'amount' | 'remaining_amount'>): number {
	if (compareDecimals(debt.amount, '0') <= 0) return 0;
	return Math.min(100, Math.max(0, chartValue(divideDecimals(paidAmount(debt), debt.amount, 4)) * 100));
}

/**
 * The remaining amount, of one type or of every debt given, per currency,
 * in the order first seen.
 *
 * A contact can owe in two currencies, and adding rupiah to dollars is the
 * one sum this must never make, so each currency keeps its own total.
 */
export function remainingByCurrency(
	debts: DebtLike[],
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
