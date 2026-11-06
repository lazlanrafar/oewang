<script lang="ts">
	/**
	 * The `budget` canvas (D103): one month of budgets against spending.
	 *
	 * Ported from the old app's `chat-canvas-budget.tsx`: what was spent of
	 * the total, what remains, a bar per budget with the fullest first, and
	 * the API's own summary sentence. The bars and their colours are the
	 * budget page's, from `$lib/budgets`, so the two cannot disagree on what
	 * "over" looks like. Every figure is the API's (D27).
	 */
	import { StatCard } from '../../../molecules/stat-card/index.js';
	import { barValue, BAR_TONE, TEXT_TONE } from '$lib/budgets';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { BudgetStatus } from '$lib/reports';
	import { cn } from '$lib/utils';

	import CanvasSection from './canvas-section.svelte';

	let { report }: { report: BudgetStatus } = $props();

	const money = (value: string) => formatMoney(value, report.currency_code);
</script>

<div class="flex flex-col gap-8 px-6 py-6">
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<StatCard
			label={t('canvas.budget_spent')}
			value={{ value: report.spent, format: money }}
			hint={t('canvas.budget_spent_hint', { total: money(report.budgeted) })}
		/>
		<StatCard
			label={t('canvas.budget_remaining')}
			value={{ value: report.remaining, format: money }}
			hint={t('canvas.budget_remaining_hint', { percent: report.percent })}
		/>
	</div>

	<CanvasSection title={t('canvas.budget_by_category')}>
		<ul class="flex flex-col gap-4">
			{#each report.budgets as budget (budget.id)}
				<li class="flex flex-col gap-1.5">
					<div class="flex items-baseline justify-between gap-3 text-xs">
						<span class="truncate font-medium">{budget.category_name}</span>
						<span class="text-subtle shrink-0 tabular-nums">
							{money(budget.spent)} / {money(budget.amount)}
							<span class={cn('ml-2 font-medium', TEXT_TONE[budget.state])}>
								{budget.percent}%
							</span>
						</span>
					</div>
					<div class="bg-muted h-1.5 w-full overflow-hidden" aria-hidden="true">
						<div
							class={cn('h-full', BAR_TONE[budget.state])}
							style:width="{barValue(budget.percent)}%"
						></div>
					</div>
				</li>
			{/each}
		</ul>
	</CanvasSection>

	<CanvasSection title={t('canvas.summary')}>
		<p class="text-sm">{report.summary}</p>
	</CanvasSection>
</div>
