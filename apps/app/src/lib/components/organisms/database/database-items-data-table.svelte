<script lang="ts">
	/**
	 * Every item the workspace has bought, one row per item and currency
	 * (ITM-1). A row opens that item's price history.
	 *
	 * Prices are decimal strings from the API, formatted in the item's own
	 * currency and never parsed (D12). It holds no data and fetches nothing.
	 */
	import X from '@lucide/svelte/icons/x';

	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { t } from '$lib/i18n';
	import { compareDecimals, formatMoney } from '$lib/money';
	import type { ItemSummary } from '$lib/server/ledger';

	import { ITEM_COLUMNS } from './database-items-data-table-column';

	let {
		items,
		sort,
		onSortChange,
		onOpenRow,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		filtered = false,
		onClear,
		loading = false,
		class: className
	}: {
		items: ItemSummary[];
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
		onOpenRow?: (item: ItemSummary) => void;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		/** Decides which of the two empty states shows (UI-2). */
		filtered?: boolean;
		onClear?: () => void;
		/** Rows are on their way: the table draws its skeleton (D108). */
		loading?: boolean;
		class?: string;
	} = $props();

	const dateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});

	const LABEL: Record<string, string> = {
		name: t('items.col_name'),
		last_price: t('items.col_last_price'),
		last_bought_at: t('items.col_last_bought_at'),
		purchases: t('items.col_purchases'),
		range: t('items.col_range')
	};
</script>

<DataTable
	{loading}
	class={className}
	columns={ITEM_COLUMNS}
	rows={items}
	label={t('nav.items')}
	onRowClick={onOpenRow}
	{hasMore}
	{loadingMore}
	loadingMoreLabel={t('common.loading')}
	{onLoadMore}
>
	{#snippet head(column)}
		<DataTableSortHead
			key={column.key}
			label={LABEL[column.key] ?? column.label}
			sortable={column.sortable}
			{sort}
			{onSortChange}
		/>
	{/snippet}

	{#snippet cell(column, item)}
		{#if column.key === 'name'}
			<span class="truncate px-4 font-medium">{item.name}</span>
		{:else if column.key === 'last_price'}
			<span class="flex items-baseline justify-end gap-1 px-4 tabular-nums">
				{#if item.last_discount}
					<span
						class="text-subtle border px-1 text-[10px] font-medium"
						title={t('items.discount_hint', {
							amount: formatMoney(item.last_discount, item.currency_code)
						})}
					>
						{t('items.discount_badge')}
					</span>
				{/if}
				<span class="font-medium">{formatMoney(item.last_price, item.currency_code)}</span>
				{#if item.last_unit}
					<span class="text-subtle text-xs">{t('items.per_unit', { unit: item.last_unit })}</span>
				{/if}
			</span>
		{:else if column.key === 'last_bought_at'}
			<span class="text-subtle truncate px-4">
				{dateFormatter.format(new Date(item.last_bought_at))}
			</span>
		{:else if column.key === 'purchases'}
			<span class="px-4 tabular-nums">{t('items.purchases_count', { count: item.purchases })}</span>
		{:else if column.key === 'range'}
			<span class="text-subtle truncate px-4 tabular-nums">
				{#if compareDecimals(item.min_price, item.max_price) === 0}
					{formatMoney(item.min_price, item.currency_code)}
				{:else}
					{t('items.range', {
						low: formatMoney(item.min_price, item.currency_code),
						high: formatMoney(item.max_price, item.currency_code, { withSymbol: false })
					})}
				{/if}
			</span>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('items.empty_filtered_title')}
				description={t('items.empty_filtered_description')}
				actionLabel={t('items.clear')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('items.empty_title')}
				description={t('items.empty_description')}
			/>
		{/if}
	{/snippet}
</DataTable>
