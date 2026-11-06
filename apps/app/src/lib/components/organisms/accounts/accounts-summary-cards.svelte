<script lang="ts">
	/**
	 * The three figures above the accounts table, on `molecules/page-card`,
	 * the old app's `DataTablePageCard`. Each counts up when it arrives (D108).
	 *
	 * The total arrives as the API's decimal string and is printed by
	 * `formatMoney`; this component does no arithmetic on money and never
	 * turns it into a number (D12, D27).
	 */
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import { cn } from '$lib/utils';

	import { PageCard } from '../../molecules/page-card/index.js';

	let {
		total,
		currency,
		count,
		counted,
		unconverted = 0,
		loading = false,
		class: className
	}: {
		/** The workspace-currency total, a decimal string. */
		total: string;
		/** The workspace currency, which the total is in. */
		currency: string;
		count: number;
		counted: number;
		/** How many wallets had no rate today, so the total can say it is partial. */
		unconverted?: number;
		loading?: boolean;
		class?: string;
	} = $props();

	const plain = (value: string) => value;
</script>

<div class={cn('grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
	<!-- An honest partial figure beats a wrong whole one: a wallet whose
	     currency has no rate today is left out, and the card says so. -->
	<PageCard
		label={t('accounts.total_balance')}
		value={{ value: total, format: (value) => formatMoney(value, currency) }}
		hint={unconverted > 0 ? t('accounts.total_partial', { count: unconverted }) : undefined}
		{loading}
	/>
	<PageCard label={t('accounts.count')} value={{ value: String(count), format: plain }} {loading} />
	<!-- "Counted in totals", not "Active": the schema has no such flag, and
	     this is the number that explains the total beside it. -->
	<PageCard
		label={t('accounts.counted')}
		value={{ value: String(counted), format: plain }}
		tone="positive"
		{loading}
	/>
</div>
