<script lang="ts">
	/**
	 * Items (ITM-1, ITM-2): every line item ever bought, one row per item,
	 * with what it cost last time. A row opens its price history in a
	 * sheet, and each purchase there links to its transaction.
	 *
	 * The standard list screen (D81). Every view choice, including the open
	 * item, is in the URL (UI-8, D55).
	 */
	import { untrack } from 'svelte';

	import { navigating, page } from '$app/state';

	import type { TableSort } from '$lib/components/molecules/data-table';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import {
		DatabaseItemHistorySheet,
		DatabaseItemsDataTable
	} from '$lib/components/organisms/database';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { ItemSummary } from '$lib/server/ledger';
	import { readText, writeParams } from '$lib/url-state';
	import { workspaceLists } from '$lib/workspace-data.svelte';

	let { data } = $props();

	const held = pagedRows<ItemSummary>();
	$effect(() => {
		const next = { rows: data.items, page: data.meta.page ?? 1, key: data.filterKey };
		untrack(() => held.update(next));
	});

	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	/** The default is newest purchase first, which the URL leaves unsaid. */
	const sort = $derived.by<TableSort>(() => {
		const key = readText(page.url, 'sort') || 'last_bought_at';
		const order = readText(page.url, 'order');
		return {
			key,
			descending: order ? order === 'desc' : key === 'last_bought_at'
		};
	});

	function changeSort(next: TableSort) {
		const isDefault =
			next.key === null || (next.key === 'last_bought_at' && next.descending);
		writeParams({
			sort: isDefault ? null : next.key,
			order: isDefault ? null : next.descending ? 'desc' : 'asc',
			page: null
		});
	}

	/** The search and the currency facet, in the URL; a change starts at page one. */
	const bar = filterBar({ currency: 'currency' }, { resetPage: true });

	const lists = workspaceLists();
	const currencyOptions = $derived(
		[...new Set(lists.wallets.map((wallet) => wallet.currency_code))]
			.sort()
			.map((code) => ({ id: code, name: code }))
	);

	const clear = () => writeParams({ search: null, currency: null, page: null });

	const sheetOpen = $derived(data.open !== null);
</script>

<svelte:head><title>{pageTitle(t('nav.items'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('nav.items')}</h1>

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters={bar.filters}
				facets={[
					{
						id: 'currency',
						label: t('accounts.currency'),
						options: currencyOptions,
						multiple: false
					}
				]}
				placeholder={t('items.search_placeholder')}
				showAmount={false}
				showDate={false}
				class="w-full"
			/>
		</div>
	</div>

	<DatabaseItemsDataTable
		class="min-h-0 flex-1"
		items={held.rows}
		{sort}
		onSortChange={changeSort}
		onOpenRow={(item) => writeParams({ item: item.id }, { push: true })}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		filtered={data.filtered}
		onClear={clear}
	/>
</div>

<DatabaseItemHistorySheet
	open={sheetOpen}
	onOpenChange={(open) => {
		if (!open) writeParams({ item: null });
	}}
	item={data.open?.item ?? null}
	purchases={data.open?.purchases ?? []}
	total={data.open?.total ?? 0}
/>
