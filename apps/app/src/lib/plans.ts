/**
 * The workspace's plan, as the app reads it (D128, PLN-7).
 *
 * The API refuses what a plan leaves out whatever the app shows; these
 * only keep an entry point from being offered when it would fail on
 * click, and measure the sidebar's bars against the plan's limits.
 */

import { featureLabel } from '$lib/console';
import { t } from '$lib/i18n';

/** `Feature::key()` in the API. */
export type PlanFeature = 'chat' | 'telegram' | 'receipt_scan' | 'statement_import' | 'mcp' | 'vault';

/**
 * The first of `needed` the plan leaves out, or null.
 *
 * Null `features` means the plan could not be read, and then nothing is
 * withheld: the API still refuses, and a failed read must not take every
 * entry point away.
 */
export function missingFeature(
	features: readonly string[] | null,
	needed: readonly PlanFeature[]
): PlanFeature | null {
	if (features === null) return null;
	return needed.find((feature) => !features.includes(feature)) ?? null;
}

/** Why a control is off: the feature named. */
export function notInPlan(feature: PlanFeature): string {
	const label = featureLabel(feature);
	return t('plan.not_included', { feature: label ? t(label) : feature });
}

/**
 * How much of a limit is used, in percent, or null for an unlimited one.
 * Past the limit reads over 100. A zero limit is full from the start.
 */
export function limitPercent(used: number, limit: number | null): number | null {
	if (limit === null) return null;
	if (limit <= 0) return 100;
	return (used / limit) * 100;
}
