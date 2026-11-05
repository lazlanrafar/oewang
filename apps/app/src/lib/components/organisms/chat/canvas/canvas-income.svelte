<script lang="ts">
	/**
	 * The `income` canvas (D88): what came in over a range.
	 *
	 * Ported from the old app's `chat-canvas-revenue.tsx`, with the data it
	 * expected and never got: the monthly series beside the same months a
	 * year earlier, and the latest income rows.
	 */
	import { ChartArea, ChartBar } from '../../../molecules/chart/index.js';
	import { StatCard } from '../../../molecules/stat-card/index.js';
	import { t } from '$lib/i18n';
	import { chartValue, formatMoney } from '$lib/money';
	import { shareLabel, type IncomeSummary } from '$lib/reports';

	import CanvasRows from './canvas-rows.svelte';
	import CanvasSection from './canvas-section.svelte';
	import { changeOf, comparedWith } from './comparison.js';

	let { report }: { report: IncomeSummary } = $props();

	/** Figures print in the app's own format, the currency code in front (D12). */
	const money = (value: string) => formatMoney(value, report.currency_code);

	const top = $derived(report.categories.find((share) => !share.other) ?? null);

	const points = $derived(
		report.months.map((month, index) => {
			const before = report.previous_year[index];
			return {
				month: month.month,
				value: chartValue(month.value),
				formatted: money(month.value),
				compare: before ? chartValue(before.value) : undefined,
				compareFormatted: before ? money(before.value) : undefined
			};
		})
	);

	const bars = $derived(
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
			label={t('canvas.total_earned')}
			value={money(report.total.value)}
			change={changeOf(report.total)}
			changeLabel={comparedWith(report.total)}
			hint={t('canvas.total_earned_hint', { count: report.count })}
		/>
		<StatCard
			label={t('canvas.average_monthly')}
			value={money(report.average_monthly)}
			hint={t('canvas.average_monthly_hint', { count: report.months.length })}
		/>
	</div>

	<CanvasSection title={t('canvas.monthly_income')}>
		<ChartArea
			{points}
			label={t('canvas.series_current')}
			compareLabel={t('canvas.series_previous_year')}
			average={{
				value: chartValue(report.average_monthly),
				formatted: money(report.average_monthly),
				label: t('canvas.series_average')
			}}
		/>
	</CanvasSection>

	{#if bars.length > 0}
		<CanvasSection title={t('canvas.income_by_category')}>
			{#if top}
				<p class="text-subtle text-small">
					{t('canvas.top_income_category')}: {shareLabel(top)} · {top.share_formatted ?? ''}
				</p>
			{/if}
			<ChartBar items={bars} label={t('canvas.income_by_category')} />
		</CanvasSection>
	{/if}

	{#if report.latest.length > 0}
		<CanvasSection title={t('canvas.latest_income')}>
			<CanvasRows rows={report.latest} currency={report.currency_code} />
		</CanvasSection>
	{/if}
</div>
