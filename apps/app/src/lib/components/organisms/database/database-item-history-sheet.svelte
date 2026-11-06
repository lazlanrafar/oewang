<script lang="ts">
	/**
	 * One item's price history (ITM-2): what it cost the last time, the
	 * lowest and highest it has cost, and every purchase, newest first, each
	 * linking to its transaction.
	 *
	 * Every figure is the API's: the price of a purchase is worked out in
	 * SQL, and this sheet formats decimal strings without parsing one (D12).
	 */
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';

	import * as Sheet from '$lib/components/atoms/sheet';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { ItemPurchase, ItemSummary } from '$lib/server/ledger';

	let {
		open = $bindable(false),
		onOpenChange,
		item,
		purchases,
		total
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Null while nothing is selected, so the sheet renders empty. */
		item: ItemSummary | null;
		purchases: ItemPurchase[];
		/** Every purchase, when `purchases` is only the newest of them. */
		total: number;
	} = $props();

	const LABEL = 'px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-widest';

	const dateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	/** `2.500` as `2.5`, `10.000` as `10`: trailing zeroes of the fraction only. */
	const quantity = (purchase: ItemPurchase) => {
		if (!purchase.quantity) return '';
		const figure = purchase.quantity.includes('.')
			? purchase.quantity.replace(/0+$/, '').replace(/\.$/, '')
			: purchase.quantity;
		return purchase.unit ? `${figure} ${purchase.unit}` : figure;
	};

	const stats = $derived(
		item
			? [
					{ label: t('items.stat_last'), value: formatMoney(item.last_price, item.currency_code) },
					{ label: t('items.stat_lowest'), value: formatMoney(item.min_price, item.currency_code) },
					{ label: t('items.stat_highest'), value: formatMoney(item.max_price, item.currency_code) },
					{ label: t('items.stat_purchases'), value: String(item.purchases) }
				]
			: []
	);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		{#if item}
			<div class="flex-1 space-y-8 overflow-y-auto p-6">
				<div class="space-y-3">
					<Sheet.Title class={LABEL + ' flex items-center gap-2 px-0'}>
						<ShoppingBasket class="text-muted-foreground/60 size-3" aria-hidden="true" />
						<span>{t('items.history_title')}</span>
					</Sheet.Title>
					<Sheet.Description class="sr-only">{t('items.history_description')}</Sheet.Description>
					<p class="font-serif text-3xl font-medium tracking-tight break-words">{item.name}</p>
				</div>

				<dl class="grid grid-cols-2 gap-px border bg-border">
					{#each stats as stat (stat.label)}
						<div class="bg-background space-y-1 p-3">
							<dt class={LABEL + ' px-0'}>{stat.label}</dt>
							<dd class="font-medium tabular-nums">{stat.value}</dd>
						</div>
					{/each}
				</dl>

				<section class="space-y-2">
					<h3 class={LABEL}>{t('items.history_description')}</h3>
					{#if purchases.length === 0}
						<p class="text-subtle px-1 text-sm">{t('items.history_empty')}</p>
					{:else}
						<ul class="divide-y border">
							{#each purchases as purchase (purchase.id)}
								<li>
									<a
										href={`/transactions?detail=${encodeURIComponent(purchase.transaction_id)}`}
										class="hover:bg-muted/50 flex items-center gap-3 px-3 py-2.5 text-sm transition-colors"
										title={t('items.open_transaction')}
									>
										<span class="min-w-0 flex-1">
											<span class="block truncate font-medium">
												{purchase.transaction_name ?? purchase.wallet_name}
											</span>
											<span class="text-subtle block truncate text-xs">
												{dateFormatter.format(new Date(purchase.date))} · {purchase.wallet_name}
												{#if purchase.brand}· {purchase.brand}{/if}
											</span>
										</span>
										<span class="shrink-0 text-right tabular-nums">
											<span class="block font-medium">
												{formatMoney(purchase.price, purchase.currency_code)}
											</span>
											{#if quantity(purchase)}
												<span class="text-subtle block text-xs">
													{quantity(purchase)} · {formatMoney(purchase.amount, purchase.currency_code)}
												</span>
											{/if}
											{#if purchase.transaction_discount}
												<span class="text-subtle block text-xs">
													{t('items.receipt_discount', {
														amount: formatMoney(purchase.transaction_discount, purchase.currency_code)
													})}
												</span>
											{/if}
										</span>
										<ArrowUpRight class="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
									</a>
								</li>
							{/each}
						</ul>
						{#if total > purchases.length}
							<p class="text-subtle px-1 text-xs">
								{t('items.history_more', { shown: purchases.length, total })}
							</p>
						{/if}
					{/if}
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
