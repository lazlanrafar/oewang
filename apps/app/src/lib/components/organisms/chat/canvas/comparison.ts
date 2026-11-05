/**
 * The change line under a canvas or overview figure.
 *
 * The percentage is the API's, already rounded to one place (D27). It
 * becomes a number here only because the stat card takes one to choose its
 * arrow; it is printed back as the same digits.
 */

import { t } from '$lib/i18n';
import { rangeLabel, type Figure } from '$lib/reports';

/** The percentage, or nothing when there was nothing to compare against. */
export function changeOf(figure: Figure): number | undefined {
	const percent = figure.comparison.percent;
	if (percent === null) return undefined;

	const value = Number(percent);
	return Number.isFinite(value) ? value : undefined;
}

/** "vs 2 Oct to 31 Oct 2026", or that there is nothing to compare against. */
export function comparedWith(figure: Figure): string {
	const { from, to, percent } = figure.comparison;
	return percent === null
		? t('canvas.no_comparison')
		: t('canvas.vs_previous', { range: rangeLabel(from, to) });
}
