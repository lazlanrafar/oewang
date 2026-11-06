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

	import X from '@lucide/svelte/icons/x';

	import { navigating, page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import type { TableSort } from '$lib/components/molecules/data-table';
	import {
		DatabaseItemHistorySheet,
		DatabaseItemsDataTable
	} from '$lib/components/organisms/database';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { ItemSummary } from '$lib/server/ledger';
	import { readText, writeParams } from '$lib/url-state';

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

	let search = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		search = readText(page.url, 'search');
	});

	function applySearch(next: string) {
		if (next === readText(page.url, 'search')) return;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => writeParams({ search: next, page: null }), 300);
	}

	const clear = () => writeParams({ search: null, page: null });

	const sheetOpen = $derived(data.open !== null);
</script>

<svelte:head><title>{pageTitle(t('nav.items'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('nav.items')}</h1>

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center gap-2">
			<Input
				class="w-full max-w-sm"
				placeholder={t('items.search_placeholder')}
				aria-label={t('items.search_placeholder')}
				bind:value={search}
				oninput={(event) => applySearch(event.currentTarget.value)}
			/>
			{#if data.filtered}
				<Button variant="ghost" size="sm" onclick={clear}>
					<X />
					{t('items.clear')}
				</Button>
			{/if}
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
