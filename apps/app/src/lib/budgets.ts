/**
 * How a budget's state is drawn, in one place so the page, its cards and
 * the chat canvas cannot disagree on what "over" looks like.
 *
 * The thresholds are the API's (`BudgetState`, D103): warning from 80%,
 * over past 100%. Nothing here compares numbers.
 */
import type { BudgetState } from '$lib/reports';

/** The bar's fill. */
export const BAR_TONE: Record<BudgetState, string> = {
	safe: 'bg-primary',
	warning: 'bg-amber-500',
	over: 'bg-destructive'
};

/** A percentage or a figure in that state. */
export const TEXT_TONE: Record<BudgetState, string> = {
	safe: 'text-subtle',
	warning: 'text-amber-600 dark:text-amber-500',
	over: 'text-destructive'
};

/** A figure that is plain until the budget is over. */
export const FIGURE_TONE: Record<BudgetState, string> = {
	safe: '',
	warning: 'text-amber-600 dark:text-amber-500',
	over: 'text-destructive'
};

/** The share of the track a bar fills, capped at the track. */
export const barValue = (percent: number) => Math.min(Math.max(percent, 0), 100);
