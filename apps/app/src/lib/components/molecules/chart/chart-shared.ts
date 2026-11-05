/**
 * What the chart molecules share: the palette, the hatch, the axis and grid
 * styling, and the axis formats.
 *
 * Monochrome and hatched on purpose, as the old app drew them (D93): the
 * measured series is a solid line over a diagonal hatch, a comparison is a
 * dashed line, the grid is dashed and the axes carry no rule. Colour would
 * have to mean something, and nothing here means "good" or "bad".
 */

/** The main series, then the comparison series, lightest last. */
export const CHART_COLORS = [
	'var(--chart-actual-line)',
	'var(--chart-line-secondary)',
	'var(--chart-axis-text)',
	'var(--chart-grid-stroke)'
] as const;

/**
 * How dense the hatch is, by what it fills. The old app hatched a line's
 * area at 0.6, an outflow at 0.4 and a bar at 0.35, so a page of mixed
 * charts reads as one family without every fill weighing the same.
 */
export const HATCH = { area: 0.6, outflow: 0.4, bar: 0.35 } as const;

/** The old app's dashed grid and bare axes, as layerchart props. */
export const GRID = {
	x: { stroke: 'var(--chart-grid-stroke)', dashArray: '3 3' },
	y: { stroke: 'var(--chart-grid-stroke)', dashArray: '3 3' }
};

export const AXIS = {
	rule: false,
	tickMarks: false,
	tickLabelProps: { class: 'fill-[var(--chart-axis-text)] text-[10px]' }
};

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
