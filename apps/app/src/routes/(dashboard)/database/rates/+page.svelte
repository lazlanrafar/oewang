<script lang="ts">
	/**
	 * Currency rates (FX-1): the stored daily snapshot, every currency
	 * against the workspace's own (D96). Read only; the daily job fills it.
	 *
	 * The standard list screen (D81): one header line with the filters on
	 * the left, the shared table filling the rest. Every view choice is in
	 * the URL (UI-8, D55).
	 */
	import { untrack } from 'svelte';

	import { navigating, page } from '$app/state';

	import X from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/atoms/button';
	import type { TableSort } from '$lib/components/molecules/data-table';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { DatePicker } from '$lib/components/molecules/date-picker';
	import { DatabaseRatesDataTable } from '$lib/components/organisms/database';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { SnapshotRate } from '$lib/server/ledger';
	import { readText, writeParams } from '$lib/url-state';

	let { data } = $props();

	const held = pagedRows<SnapshotRate>();
	$effect(() => {
		const next = { rows: data.rates, page: data.meta.page ?? 1, key: data.filterKey };
		untrack(() => held.update(next));
	});

	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);
	const dateFormatter = new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const snapshotDate = $derived(
		data.rates[0] ? dateFormatter.format(new Date(data.rates[0].date)) : ''
	);

	const clear = () => writeParams({ search: null, date: null, page: null });

	const sort = $derived<TableSort>({
		key: readText(page.url, 'sort') || 'code',
		descending: readText(page.url, 'order') === 'desc'
	});

	/** The search, in the URL; a new one starts at page one. */
	const bar = filterBar({}, { resetPage: true });
</script>

<svelte:head><title>{pageTitle(t('nav.rates'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<!-- No visible title: the sidebar says where the reader is (D81). The
	     heading stays for anyone navigating by headings (UI-6). -->
	<h1 class="sr-only">{t('nav.rates')}</h1>

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center gap-2">
			<DataTableFilter
				bind:filters={bar.filters}
				placeholder={t('rates.search_placeholder')}
				showAmount={false}
				showDate={false}
				class="max-w-xs"
			/>
			<DatePicker
				value={readText(page.url, 'date')}
				placeholder={t('rates.date_label')}
				onValueChange={(value) => writeParams({ date: value, page: null })}
				class="w-48"
			/>
			{#if data.filtered}
				<Button variant="ghost" size="sm" onclick={clear}>
					<X />
					{t('rates.clear')}
				</Button>
			{/if}
		</div>

		{#if snapshotDate}
			<p class="text-subtle shrink-0 text-sm">
				{t('rates.snapshot_of', { date: snapshotDate, home: data.home })}
			</p>
		{/if}
	</div>

	<DatabaseRatesDataTable
		class="min-h-0 flex-1"
		rates={held.rows}
		home={data.home}
		{sort}
		onSortChange={(next) =>
			writeParams({
				sort: next.key === 'code' || next.key === null ? null : next.key,
				order: next.key === null || !next.descending ? null : 'desc',
				page: null
			})}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		filtered={data.filtered}
		onClear={clear}
	/>
</div>
