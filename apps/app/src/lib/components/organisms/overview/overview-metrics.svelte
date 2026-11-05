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

	import * as Empty from '../../molecules/empty/index.js';
	import { ChartArea, ChartBar } from '../../molecules/chart/index.js';

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

{#snippet panel(title: string, filled: boolean, body: import('svelte').Snippet)}
	<section class="border-border flex min-w-0 flex-col gap-4 border p-4">
		<h2 class="font-serif text-lg">{title}</h2>
		{#if filled}
			{@render body()}
		{:else}
			<Empty.Root>
				<Empty.Header>
					<Empty.Description>{t('overview.chart_empty')}</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</section>
{/snippet}

<div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
	{#snippet incomeChart()}
		<ChartArea
			points={income}
			label={t('overview.chart_income')}
			average={{
				value: chartValue(overview.average_income),
				formatted: money(overview.average_income),
				label: t('canvas.series_average')
			}}
		/>
	{/snippet}
	{@render panel(t('overview.chart_income'), hasIncome, incomeChart)}

	{#snippet expenseChart()}
		<ChartArea
			points={expense}
			label={t('overview.chart_expense')}
			average={{
				value: chartValue(overview.average_expense),
				formatted: money(overview.average_expense),
				label: t('canvas.series_average')
			}}
		/>
	{/snippet}
	{@render panel(t('overview.chart_expense'), hasExpense, expenseChart)}

	{#snippet incomeBreakdown()}
		<ChartBar items={bars(overview.income_categories)} label={t('overview.chart_income_breakdown')} />
	{/snippet}
	{@render panel(
		t('overview.chart_income_breakdown'),
		overview.income_categories.length > 0,
		incomeBreakdown
	)}

	{#snippet expenseBreakdown()}
		<ChartBar items={bars(overview.expense_categories)} label={t('overview.chart_expense_breakdown')} />
	{/snippet}
	{@render panel(
		t('overview.chart_expense_breakdown'),
		overview.expense_categories.length > 0,
		expenseBreakdown
	)}

	<div class="xl:col-span-2">
		{#snippet burnChart()}
			<ChartArea
				points={expense}
				label={t('canvas.series_current')}
				average={{
					value: chartValue(overview.average_expense),
					formatted: money(overview.average_expense),
					label: t('canvas.series_average')
				}}
				height={280}
			/>
		{/snippet}
		{@render panel(t('overview.chart_burn'), hasExpense, burnChart)}
	</div>
</div>
