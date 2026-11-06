/**
 * Report shapes, as the API answers them (D87, D88).
 *
 * The overview page and the chat canvases read the same builders in Rust, so
 * one set of types serves both. No server imports: the canvases render these
 * in the browser.
 *
 * Every money field is a decimal string beside its `_formatted` twin (D12,
 * D27). The twin is the model's: the API writes it with a symbol ("Rp"),
 * and the app prints the ISO code instead, so the pages format the raw
 * string with `formatMoney`, as every other screen does. A chart reads the
 * raw one through `chartValue`, for geometry only.
 */

import { t } from '$lib/i18n';

export type Comparison = {
	from: string;
	to: string;
	previous: string;
	previous_formatted: string;
	change: string;
	change_formatted: string;
	percent: string | null;
	percent_formatted: string | null;
	direction: 'up' | 'down' | 'flat';
};

export type Figure = {
	value: string;
	value_formatted: string;
	comparison: Comparison;
};

/** `name` is null for uncategorized rows and for "Other", which `other` tells apart. */
export type CategoryShare = {
	id: string | null;
	name: string | null;
	other: boolean;
	total: string;
	total_formatted: string;
	share_percent: string | null;
	share_formatted: string | null;
};

export type MonthPoint = {
	month: string;
	income: string;
	income_formatted: string;
	expense: string;
	expense_formatted: string;
	net: string;
	net_formatted: string;
};

export type MonthValue = { month: string; value: string; value_formatted: string };

export type ReportRow = {
	id: string;
	date: string;
	name: string | null;
	category_name: string | null;
	wallet_name: string;
	amount: string;
	amount_formatted: string;
	share_percent: string | null;
	share_formatted: string | null;
};

export type Overview = {
	from: string;
	to: string;
	currency_code: string;
	income: Figure;
	expense: Figure;
	net: Figure;
	months: MonthPoint[];
	average_income: string;
	average_income_formatted: string;
	average_expense: string;
	average_expense_formatted: string;
	expense_categories: CategoryShare[];
	income_categories: CategoryShare[];
};

export type SpendingAnalysis = {
	from: string;
	to: string;
	currency_code: string;
	total: Figure;
	count: number;
	categories: CategoryShare[];
	largest: ReportRow[];
};

export type IncomeSummary = {
	from: string;
	to: string;
	currency_code: string;
	total: Figure;
	count: number;
	average_monthly: string;
	average_monthly_formatted: string;
	months: MonthValue[];
	previous_year: MonthValue[];
	categories: CategoryShare[];
	latest: ReportRow[];
};

export type BurnRate = {
	from: string;
	to: string;
	currency_code: string;
	total: Figure;
	average_monthly: string;
	average_monthly_formatted: string;
	months: MonthValue[];
	months_above_average: number;
};

export type BudgetState = 'safe' | 'warning' | 'over';

/** One budget in one month (BUD-2). */
export type BudgetLine = {
	id: string;
	category_id: string;
	category_name: string;
	amount: string;
	amount_formatted: string;
	spent: string;
	spent_formatted: string;
	/** Negative once the budget is over. */
	remaining: string;
	remaining_formatted: string;
	/** Whole percent of the limit, past 100 when over. */
	percent: number;
	state: BudgetState;
};

/**
 * Every budget in one month: the budget page's load and the `budget` canvas
 * (D103). Totals cover every budget whatever the search; `budgets` is the
 * searched and sorted list.
 */
export type BudgetStatus = {
	/** `YYYY-MM`. */
	month: string;
	from: string;
	to: string;
	currency_code: string;
	budgeted: string;
	budgeted_formatted: string;
	spent: string;
	spent_formatted: string;
	remaining: string;
	remaining_formatted: string;
	percent: number;
	state: BudgetState;
	count: number;
	over_count: number;
	summary: string;
	budgets: BudgetLine[];
};

/**
 * `2026-03` as "Mar 2026", or "Mar" when every month is in one year.
 *
 * Built from the parts rather than through `new Date('2026-03')`, which
 * reads the string as UTC and lands in February for anyone west of it.
 */
export function monthLabel(month: string, withYear = true, locale = 'en-GB'): string {
	const [year, index] = month.split('-').map(Number);
	if (!year || !index) return month;

	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		...(withYear ? { year: 'numeric' } : {})
	}).format(new Date(year, index - 1, 1));
}

/** Whether a run of months crosses a year, which decides whether labels need one. */
export function spansYears(months: { month: string }[]): boolean {
	return new Set(months.map((point) => point.month.slice(0, 4))).size > 1;
}

/** A day range in words: "1 Mar to 31 Mar 2026". The joining word is the dictionary's. */
export function rangeLabel(from: string, to: string, locale = 'en-GB'): string {
	const day = (value: string) => {
		const [year, month, date] = value.split('-').map(Number);
		return new Date(year, month - 1, date);
	};
	const start = day(from);
	const end = day(to);
	const sameYear = start.getFullYear() === end.getFullYear();

	const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
	const long = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	return t('canvas.range', { from: (sameYear ? short : long).format(start), to: long.format(end) });
}

/** A breakdown slice's name: its category, or the dictionary's word for none or the rest. */
export function shareLabel(share: Pick<CategoryShare, 'name' | 'other'>): string {
	if (share.other) return t('canvas.other');
	return share.name ?? t('canvas.uncategorized');
}
