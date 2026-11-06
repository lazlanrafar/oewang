import type { Artifact } from '$lib/artifacts';
import { t, type TranslationKey } from '$lib/i18n';
import { rangeLabel } from '$lib/reports';

const TITLE_KEYS: Record<Artifact['kind'], TranslationKey> = {
	spending: 'canvas.spending_title',
	income: 'canvas.income_title',
	'burn-rate': 'canvas.burn-rate_title',
	budget: 'canvas.budget_title'
};

/** "Expense · 1 Nov to 30 Nov 2026": the kind, then the range it covers. */
export function artifactTitle(artifact: Artifact): string {
	return `${artifactKindTitle(artifact)} · ${rangeLabel(artifact.payload.from, artifact.payload.to)}`;
}

export function artifactKindTitle(artifact: Pick<Artifact, 'kind'>): string {
	return t(TITLE_KEYS[artifact.kind]);
}
