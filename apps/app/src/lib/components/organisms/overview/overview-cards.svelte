<script lang="ts">
	/**
	 * The overview tab's figures (D87, OVR-2).
	 *
	 * Ported from the old app's `overview-cards.tsx`, minus budget usage and
	 * debt balance, which stay out of v1 (PRD non-goals). Every figure is the
	 * API's formatted string, and every card covers the whole selected range,
	 * which the old cards claimed and did not do: they showed the last month
	 * under a label for the year.
	 *
	 * A card is a question as well as a figure: clicking it asks the
	 * assistant about it, as the old cards did.
	 */
	import Flame from '@lucide/svelte/icons/flame';
	import PieChart from '@lucide/svelte/icons/chart-pie';
	import Receipt from '@lucide/svelte/icons/receipt';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Scale from '@lucide/svelte/icons/scale';

	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import { rangeLabel, shareLabel, type Overview } from '$lib/reports';
	import type { WalletTotals } from '$lib/wallets';

	import { StatCard } from '../../molecules/stat-card/index.js';
	import { changeOf, comparedWith } from '../chat/canvas/comparison.js';

	let {
		overview,
		balance,
		onAsk
	}: {
		overview: Overview;
		/** Streamed: it waits on today's rates, the rest of the page does not. */
		balance: Promise<{ totals: WalletTotals; formatted: string }>;
		onAsk: (message: string) => void;
	} = $props();

	/** Figures print in the app's own format, the currency code in front (D12). */
	const money = (value: string) => formatMoney(value, overview.currency_code);

	const range = $derived(rangeLabel(overview.from, overview.to));
	const top = $derived(overview.expense_categories.find((share) => !share.other) ?? null);
	const ask = (key: Parameters<typeof t>[0]) => onAsk(t(key, { range }));
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
	<StatCard
		label={t('overview.card_income')}
		icon={TrendingUp}
		value={money(overview.income.value)}
		change={changeOf(overview.income)}
		changeLabel={comparedWith(overview.income)}
		hint={range}
		ariaLabel={t('overview.card_ask', { label: t('overview.card_income') })}
		onclick={() => ask('overview.ask_income')}
	/>
	<StatCard
		label={t('overview.card_expense')}
		icon={Receipt}
		value={money(overview.expense.value)}
		change={changeOf(overview.expense)}
		changeLabel={comparedWith(overview.expense)}
		invert
		hint={range}
		ariaLabel={t('overview.card_ask', { label: t('overview.card_expense') })}
		onclick={() => ask('overview.ask_spending')}
	/>
	<StatCard
		label={t('overview.card_net')}
		icon={Scale}
		value={formatMoney(overview.net.value, overview.currency_code, { signed: true })}
		change={changeOf(overview.net)}
		changeLabel={comparedWith(overview.net)}
		hint={range}
		ariaLabel={t('overview.card_ask', { label: t('overview.card_net') })}
		onclick={() => ask('overview.ask_net')}
	/>
	<StatCard
		label={t('overview.card_top_expense')}
		icon={PieChart}
		value={top ? shareLabel(top) : t('overview.card_top_expense_none')}
		hint={top ? `${money(top.total)} · ${top.share_formatted ?? ''}` : range}
		ariaLabel={t('overview.card_ask', { label: t('overview.card_top_expense') })}
		onclick={() => ask('overview.ask_top')}
	/>
	<StatCard
		label={t('overview.card_burn')}
		icon={Flame}
		value={money(overview.average_expense)}
		hint={range}
		ariaLabel={t('overview.card_ask', { label: t('overview.card_burn') })}
		onclick={() => ask('overview.ask_burn')}
	/>
	{#await balance}
		<StatCard label={t('overview.card_balance')} icon={Wallet} value="" loading />
	{:then resolved}
		<StatCard
			label={t('overview.card_balance')}
			icon={Wallet}
			value={resolved.formatted}
			hint={resolved.totals.unconverted > 0
				? t('overview.card_balance_partial', { count: resolved.totals.unconverted })
				: t('overview.card_balance_hint', { count: resolved.totals.counted })}
			ariaLabel={t('overview.card_ask', { label: t('overview.card_balance') })}
			onclick={() => onAsk(t('overview.ask_balance'))}
		/>
	{/await}
</div>
