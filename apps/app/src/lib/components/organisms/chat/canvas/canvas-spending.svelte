<script lang="ts">
	/**
	 * The `spending` canvas (D88): where the money went over a range.
	 *
	 * Ported from the old app's `chat-canvas-spending.tsx`, without its
	 * "Summary & Recommendations" block: the reply beside the panel is that
	 * summary, written by the model from the same figures. Every figure here
	 * is the API's formatted string; the donut's angles are the only numbers
	 * this file computes, and only to draw.
	 */
	import { StatCard } from '../../../molecules/stat-card/index.js';
	import { ChartDonut } from '../../../molecules/chart/index.js';
	import { t } from '$lib/i18n';
	import { chartValue, formatMoney } from '$lib/money';
	import { shareLabel, type SpendingAnalysis } from '$lib/reports';

	import CanvasRows from './canvas-rows.svelte';
	import CanvasSection from './canvas-section.svelte';
	import { changeOf, comparedWith } from './comparison.js';

	let { report }: { report: SpendingAnalysis } = $props();

	/** Figures print in the app's own format, the currency code in front (D12). */
	const money = (value: string) => formatMoney(value, report.currency_code);

	const top = $derived(report.categories.find((share) => !share.other) ?? null);
	const slices = $derived(
		report.categories.map((share) => ({
			label: shareLabel(share),
			value: chartValue(share.total),
			formatted: money(share.total),
			share: share.share_formatted
		}))
	);
</script>

<div class="flex flex-col gap-8 px-6 py-6">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<StatCard
			label={t('canvas.total_spent')}
			value={{ value: report.total.value, format: money }}
			change={changeOf(report.total)}
			changeLabel={comparedWith(report.total)}
			invert
			hint={t('canvas.total_spent_hint', { count: report.count })}
		/>
		<StatCard
			label={t('canvas.top_category')}
			value={top ? shareLabel(top) : t('canvas.none')}
			hint={top ? `${money(top.total)} · ${top.share_formatted ?? ''}` : t('canvas.top_category_hint')}
		/>
	</div>

	{#if slices.length > 0}
		<CanvasSection title={t('canvas.by_category')}>
			<ChartDonut {slices} label={t('canvas.by_category')} />
		</CanvasSection>
	{/if}

	{#if report.largest.length > 0}
		<CanvasSection title={t('canvas.largest')}>
			<CanvasRows rows={report.largest} currency={report.currency_code} />
		</CanvasSection>
	{/if}
</div>
