<script lang="ts">
	/**
	 * The stored daily rate snapshot, one row per currency (FX-1, D96).
	 *
	 * Every figure is a decimal string from the API, formatted by
	 * `formatRate` and never parsed (D12). It holds no data and fetches
	 * nothing: rows, the sort and the paging arrive as props.
	 */
	import X from '@lucide/svelte/icons/x';

	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { t } from '$lib/i18n';
	import { formatRate } from '$lib/money';
	import type { SnapshotRate } from '$lib/server/ledger';

	import { RATE_COLUMNS } from './database-rates-data-table-column';

	let {
		rates,
		home,
		sort,
		onSortChange,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		filtered = false,
		onClear,
		loading = false,
		class: className
	}: {
		rates: SnapshotRate[];
		/** The workspace currency every rate is expressed in. */
		home: string;
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
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
		year: 'numeric',
		timeZone: 'UTC'
	});

	const LABEL: Record<string, string> = $derived({
		code: t('rates.col_currency'),
		rate: t('rates.col_rate', { home }),
		inverse: t('rates.col_inverse', { home }),
		date: t('rates.col_date')
	});
</script>

<DataTable
	{loading}
	class={className}
	columns={RATE_COLUMNS}
	rows={rates}
	label={t('nav.rates')}
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

	{#snippet cell(column, rate)}
		{#if column.key === 'code'}
			<span class="px-4 font-medium">{rate.currency_code}</span>
		{:else if column.key === 'rate'}
			<span class="px-4 tabular-nums">{formatRate(rate.rate)}</span>
		{:else if column.key === 'inverse'}
			<span class="text-subtle px-4 tabular-nums">{formatRate(rate.inverse)}</span>
		{:else if column.key === 'date'}
			<span class="text-subtle truncate px-4">{dateFormatter.format(new Date(rate.date))}</span>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('rates.empty_filtered_title')}
				description={t('rates.empty_filtered_description')}
				actionLabel={t('rates.clear')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('rates.empty_title')}
				description={t('rates.empty_description')}
			/>
		{/if}
	{/snippet}
</DataTable>
