<script lang="ts">
	/**
	 * The three figures above the budget table, the old page's cards:
	 * the month's total limit, what was spent against it, and the share used.
	 *
	 * The same card as the accounts screen's (a 10px tracked label over a
	 * serif figure), not `molecules/stat-card`, which has a change indicator
	 * these figures do not have. Every figure arrives computed (D27).
	 */
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { BudgetStatus } from '$lib/reports';
	import { cn } from '$lib/utils';

	import { FIGURE_TONE } from '$lib/budgets';

	let { status, class: className }: { status: BudgetStatus; class?: string } = $props();

	const cards = $derived([
		{ label: t('budget.total_budgeted'), value: formatMoney(status.budgeted, status.currency_code), tone: '' },
		{ label: t('budget.total_spent'), value: formatMoney(status.spent, status.currency_code), tone: '' },
		{ label: t('budget.overall_usage'), value: `${status.percent}%`, tone: FIGURE_TONE[status.state] }
	]);
</script>

<div class={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
	{#each cards as card (card.label)}
		<div class="border-border flex flex-col gap-1 border p-6">
			<span class="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
				{card.label}
			</span>
			<span
				class={cn('mt-1 font-serif text-3xl font-medium tracking-tight tabular-nums', card.tone)}
			>
				{card.value}
			</span>
		</div>
	{/each}
</div>
