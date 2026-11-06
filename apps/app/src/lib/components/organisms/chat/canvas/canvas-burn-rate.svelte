<script lang="ts">
	/**
	 * The `burn-rate` canvas (D88): spending per month over a range.
	 *
	 * Ported from the old app's `chat-canvas-burn-rate.tsx`, without its
	 * runway card, which only ever showed a dash: a runway needs a balance in
	 * one currency, and that is a decision for its own story.
	 */
	import { ChartArea } from '../../../molecules/chart/index.js';
	import { StatCard } from '../../../molecules/stat-card/index.js';
	import { t } from '$lib/i18n';
	import { chartValue, formatMoney } from '$lib/money';
	import { type BurnRate } from '$lib/reports';

	import CanvasSection from './canvas-section.svelte';
	import { changeOf, comparedWith } from './comparison.js';

	let { report }: { report: BurnRate } = $props();

	/** Figures print in the app's own format, the currency code in front (D12). */
	const money = (value: string) => formatMoney(value, report.currency_code);

	const points = $derived(
		report.months.map((month) => ({
			month: month.month,
			value: chartValue(month.value),
			formatted: money(month.value)
		}))
	);
</script>

<div class="flex flex-col gap-8 px-6 py-6">
	<CanvasSection title={t('canvas.monthly_burn')}>
		<ChartArea
			{points}
			label={t('canvas.series_current')}
			outflow
			average={{
				value: chartValue(report.average_monthly),
				formatted: money(report.average_monthly),
				label: t('canvas.series_average')
			}}
		/>
	</CanvasSection>

	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<StatCard
			label={t('canvas.average_burn')}
			value={{ value: report.average_monthly, format: money }}
			hint={t('canvas.average_monthly_hint', { count: report.months.length })}
		/>
		<StatCard
			label={t('canvas.total_spent')}
			value={{ value: report.total.value, format: money }}
			change={changeOf(report.total)}
			changeLabel={comparedWith(report.total)}
			invert
			hint={t('canvas.above_average') +
				': ' +
				t('canvas.above_average_value', {
					count: report.months_above_average,
					total: report.months.length
				})}
		/>
	</div>
</div>
