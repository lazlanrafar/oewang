<script lang="ts">
	/**
	 * The three figures above the budget table, the old page's cards: the
	 * month's total limit, what was spent against it, and the share used.
	 *
	 * On `molecules/page-card`, as the accounts cards are; each counts up
	 * when it arrives (D108). Every figure arrives computed (D27), and money
	 * stays a decimal string to the screen (D12).
	 */
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { BudgetState, BudgetStatus } from '$lib/reports';
	import { cn } from '$lib/utils';

	import { PageCard, type PageCardTone } from '../../molecules/page-card/index.js';

	let {
		status,
		loading = false,
		class: className
	}: { status: BudgetStatus; loading?: boolean; class?: string } = $props();

	/** Amber from 80%, red past 100%, as the table's figures are. */
	const TONE: Record<BudgetState, PageCardTone> = {
		safe: 'default',
		warning: 'warning',
		over: 'negative'
	};

	const money = (value: string) => formatMoney(value, status.currency_code);
</script>

<div class={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
	<PageCard
		label={t('budget.total_budgeted')}
		value={{ value: status.budgeted, format: money }}
		{loading}
	/>
	<PageCard label={t('budget.total_spent')} value={{ value: status.spent, format: money }} {loading} />
	<PageCard
		label={t('budget.overall_usage')}
		value={{ value: String(status.percent), format: (value) => `${value}%` }}
		tone={TONE[status.state]}
		{loading}
	/>
</div>
