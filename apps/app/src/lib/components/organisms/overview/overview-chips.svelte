<script lang="ts">
	/**
	 * Questions to start from, under the cards (D87).
	 *
	 * Ported from the old app's chip row, minus the budget and debt chips.
	 * Each asks about the range on screen, so the answer is about what the
	 * reader is looking at.
	 */
	import ChartPie from '@lucide/svelte/icons/chart-pie';
	import Flame from '@lucide/svelte/icons/flame';
	import List from '@lucide/svelte/icons/list';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import CalendarRange from '@lucide/svelte/icons/calendar-range';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import Wallet from '@lucide/svelte/icons/wallet';

	import { t, type TranslationKey } from '$lib/i18n';

	let {
		range,
		disabled = false,
		onAsk
	}: {
		/** The range on screen, in words, which each question names. */
		range: string;
		disabled?: boolean;
		onAsk: (message: string) => void;
	} = $props();

	const chips: { label: TranslationKey; ask: TranslationKey; icon: typeof Wallet }[] = [
		{ label: 'overview.chip_balances', ask: 'overview.ask_balances', icon: Wallet },
		{ label: 'overview.chip_spending', ask: 'overview.ask_spending', icon: ChartPie },
		{ label: 'overview.chip_latest', ask: 'overview.ask_latest', icon: List },
		{ label: 'overview.chip_monthly', ask: 'overview.ask_monthly', icon: CalendarRange },
		{ label: 'overview.chip_top', ask: 'overview.ask_top', icon: ListOrdered },
		{ label: 'overview.chip_burn', ask: 'overview.ask_burn', icon: Flame },
		{ label: 'overview.chip_income', ask: 'overview.ask_income', icon: TrendingUp }
	];
</script>

<ul class="flex flex-wrap justify-center gap-2" aria-label={t('overview.chips_label')}>
	{#each chips as chip (chip.label)}
		<li>
			<button
				type="button"
				class="border-border bg-background text-subtle text-caption hover:border-foreground/50 hover:text-foreground flex items-center gap-2 border px-3 py-2 transition-colors disabled:opacity-50"
				{disabled}
				onclick={() => onAsk(t(chip.ask, { range }))}
			>
				<chip.icon class="size-3.5" aria-hidden="true" />
				{t(chip.label)}
			</button>
		</li>
	{/each}
</ul>
