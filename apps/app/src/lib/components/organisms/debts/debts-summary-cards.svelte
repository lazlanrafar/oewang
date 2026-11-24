<script lang="ts">
	/**
	 * The four figures above the debt table, the old page's cards: owed to
	 * you, you owe, the net position, and how many are overdue (DEBT-11).
	 *
	 * Every figure is the API's, converted to the workspace currency there
	 * (D27, D117), and it covers every debt whatever the filters. Green and
	 * red as the old cards were: the page card's own tones.
	 */
	import { t } from '$lib/i18n';
	import { formatMoney, isNegative, isZero } from '$lib/money';
	import type { DebtSummary } from '$lib/server/debts';
	import { cn } from '$lib/utils';

	import { PageCard } from '../../molecules/page-card/index.js';

	let {
		summary,
		loading = false,
		class: className
	}: { summary: DebtSummary; loading?: boolean; class?: string } = $props();

	const money = (value: string) => formatMoney(value, summary.currency_code);
</script>

<div class={cn('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
	<PageCard
		label={t('debts.owed_to_you')}
		value={{ value: summary.owed_to_you, format: money }}
		tone="positive"
		{loading}
	/>
	<PageCard
		label={t('debts.you_owe_card')}
		value={{ value: summary.you_owe, format: money }}
		tone="negative"
		{loading}
	/>
	<PageCard
		label={t('debts.net_position')}
		value={{ value: summary.net, format: money }}
		tone={isZero(summary.net) ? 'default' : isNegative(summary.net) ? 'negative' : 'positive'}
		{loading}
	/>
	<PageCard
		label={t('debts.overdue')}
		value={String(summary.overdue_count)}
		tone={summary.overdue_count > 0 ? 'negative' : 'default'}
		{loading}
	/>
</div>
