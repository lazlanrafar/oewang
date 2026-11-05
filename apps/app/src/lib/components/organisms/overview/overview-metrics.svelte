<script lang="ts">
	/**
	 * The metrics tab: five charts over the selected range (D87, OVR-3).
	 *
	 * Ported from the old app's `overview-metrics.tsx`. Heights come from
	 * `chartValue`; every figure a reader can see is the API's string.
	 */
	import { t } from '$lib/i18n';
	import { chartValue, formatMoney } from '$lib/money';
	import { shareLabel, type CategoryShare, type Overview } from '$lib/reports';

	import { ChartArea, ChartBar, ChartPanel } from '../../molecules/chart/index.js';

	let { overview }: { overview: Overview } = $props();

	/** Figures print in the app's own format, the currency code in front (D12). */
	const money = (value: string) => formatMoney(value, overview.currency_code);

	const income = $derived(
		overview.months.map((month) => ({
			month: month.month,
			value: chartValue(month.income),
			formatted: money(month.income)
		}))
	);
	const expense = $derived(
		overview.months.map((month) => ({
			month: month.month,
			value: chartValue(month.expense),
			formatted: money(month.expense)
		}))
	);

	const bars = (shares: CategoryShare[]) =>
		shares.map((share) => ({
			label: shareLabel(share),
			value: chartValue(share.total),
			formatted: money(share.total),
			share: share.share_formatted
		}));

	const hasIncome = $derived(overview.months.some((month) => chartValue(month.income) > 0));
	const hasExpense = $derived(overview.months.some((month) => chartValue(month.expense) > 0));
</script>

<!--
	The old app's layout: two charts a row from xl, eight apart, each a
	titled panel with its legend in the header; burn rate across the full
	width below them.
-->
<div class="space-y-8">
	<div class="grid gap-8 xl:grid-cols-2">
		<ChartPanel
			title={t('overview.chart_income')}
			legend={[
				{ label: t('overview.chart_income'), type: 'solid' },
				{ label: t('canvas.series_average'), type: 'pattern' }
			]}
			empty={hasIncome ? null : t('overview.chart_empty')}
		>
			<ChartArea
				points={income}
				label={t('overview.chart_income')}
				legend={false}
				average={{
					value: chartValue(overview.average_income),
					formatted: money(overview.average_income),
					label: t('canvas.series_average')
				}}
			/>
		</ChartPanel>

		<ChartPanel
			title={t('overview.chart_expense')}
			legend={[
				{ label: t('overview.chart_expense'), type: 'solid' },
				{ label: t('canvas.series_average'), type: 'pattern' }
			]}
			empty={hasExpense ? null : t('overview.chart_empty')}
		>
			<ChartArea
				points={expense}
				label={t('overview.chart_expense')}
				legend={false}
				average={{
					value: chartValue(overview.average_expense),
					formatted: money(overview.average_expense),
					label: t('canvas.series_average')
				}}
			/>
		</ChartPanel>
	</div>

	<div class="grid gap-8 xl:grid-cols-2">
		<ChartPanel
			title={t('overview.chart_income_breakdown')}
			empty={overview.income_categories.length > 0 ? null : t('overview.chart_empty')}
		>
			<ChartBar items={bars(overview.income_categories)} label={t('overview.chart_income_breakdown')} />
		</ChartPanel>

		<ChartPanel
			title={t('overview.chart_expense_breakdown')}
			empty={overview.expense_categories.length > 0 ? null : t('overview.chart_empty')}
		>
			<ChartBar
				items={bars(overview.expense_categories)}
				label={t('overview.chart_expense_breakdown')}
			/>
		</ChartPanel>
	</div>

	<ChartPanel
		title={t('overview.chart_burn')}
		legend={[
			{ label: t('canvas.series_current'), type: 'solid' },
			{ label: t('canvas.series_average'), type: 'pattern' }
		]}
		empty={hasExpense ? null : t('overview.chart_empty')}
	>
		<ChartArea
			points={expense}
			label={t('canvas.series_current')}
			legend={false}
			outflow
			average={{
				value: chartValue(overview.average_expense),
				formatted: money(overview.average_expense),
				label: t('canvas.series_average')
			}}
		/>
	</ChartPanel>
</div>
