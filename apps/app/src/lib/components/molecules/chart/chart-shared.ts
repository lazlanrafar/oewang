/**
 * What the three chart molecules share: the palette and the axis formats.
 *
 * Monochrome on purpose, as the old app drew them: the foreground for the
 * series that matters, greys for the ones it is compared against. Colour
 * would have to mean something, and nothing here means "good" or "bad".
 */

/** The main series, then the comparison series, lightest last. */
export const CHART_COLORS = [
	'hsl(var(--foreground))',
	'hsl(var(--muted-foreground))',
	'hsl(var(--subtle))',
	'hsl(var(--border))'
] as const;

/**
 * Donut slices, from the theme (`--chart-slice-*` in app.css), so each
 * keeps its contrast in light and dark.
 */
export const SLICE_COLORS = [1, 2, 3, 4, 5, 6, 7].map(
	(index) => `var(--chart-slice-${index})`
);

/**
 * An axis tick. Ticks are positions on a scale, not amounts anyone entered,
 * so a compact rounded figure is the right shape: "1.2M", never a total.
 */
export function compactTick(value: number, locale = 'en-GB'): string {
	return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
		value
	);
}

/** A month on the time axis: "Mar", or "Mar 26" across a year boundary. */
export function monthTick(date: Date, withYear: boolean, locale = 'en-GB'): string {
	return new Intl.DateTimeFormat(locale, {
		month: 'short',
		...(withYear ? { year: '2-digit' } : {})
	}).format(date);
}

/** `2026-03` as the first of that month, local time. */
export function monthDate(month: string): Date {
	const [year, index] = month.split('-').map(Number);
	return new Date(year, (index || 1) - 1, 1);
}
