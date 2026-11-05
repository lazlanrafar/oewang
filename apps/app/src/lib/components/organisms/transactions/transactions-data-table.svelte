<script lang="ts">
	/**
	 * The transactions table (US-017).
	 *
	 * What is here is what only a transactions list knows: which columns, what
	 * a cell renders, the filtering, the sort, the day grouping and its
	 * per-currency totals, the selection and the two in-cell editors. The
	 * scrollport, the sticky header, the geometry, column resizing, the
	 * sideways arrows and the next-page trigger are `molecules/data-table`,
	 * which the accounts table uses too: one shell, so the two cannot drift on
	 * the part a reader would notice (D78).
	 *
	 * It holds no data and fetches nothing. Rows come in as a prop, already
	 * formatted by the API, and amounts stay decimal strings: sums are done on
	 * the digits, never on floats (D12).
	 */
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import Download from '@lucide/svelte/icons/download';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import { getLocalTimeZone } from '@internationalized/date';

	import { Button } from '../../atoms/button/index.js';
	import { Checkbox } from '../../atoms/checkbox/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import { Select } from '../../molecules/select/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import { DataTableFilter } from '../../molecules/data-table-filter/index.js';
	import {
		emptyFilterState,
		type DataTableFilterState
	} from '../../molecules/data-table-filter/index.js';
	import {
		DataTable,
		DataTableEmptyState,
		type NamedOption,
		type RowGroup
	} from '../../molecules/data-table/index.js';
	import { TRANSACTION_COLUMNS, type ColumnKey } from './transactions-data-table-column.js';
	import {
		groupKey,
		groupLabel,
		GROUPINGS,
		type Grouping
	} from './transactions-data-table-grouping.js';
	import type { SortKey, TransactionRow, TransactionSort } from './transactions-data-table-types.js';
	import {
		absDecimal,
		addDecimals,
		compareDecimals,
		formatMoney,
		isNegative,
		isZero
	} from '$lib/money.js';
	import { cn } from '$lib/utils.js';

	let {
		rows,
		categories,
		wallets,
		filters = $bindable(emptyFilterState()),
		grouping = $bindable('daily'),
		/** Which columns are off, so a page header can carry the menu. */
		hidden = $bindable({}),
		/** The sort the server applied, when the page owns it. */
		sort,
		onSortChange,
		/** Whether another page exists, and how to ask for it. */
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		locale = 'en-GB',
		/** The page can carry the filter and the actions in its own header. */
		toolbar = true,
		footer = true,
		canEdit = true,
		selection = $bindable([]),
		emptyTitle = 'No transactions yet',
		emptyDescription = 'Add one, or import a statement.',
		emptyActionLabel,
		onAdd,
		onOpenRow,
		onSelectionChange,
		onEditRow,
		onDeleteRow,
		onCategoryChange,
		onWalletChange,
		createLabel,
		class: className
	}: {
		rows: TransactionRow[];
		categories: NamedOption[];
		wallets: NamedOption[];
		filters?: DataTableFilterState;
		grouping?: Grouping;
		hidden?: Partial<Record<ColumnKey, boolean>>;
		sort?: TransactionSort;
		onSortChange?: (next: TransactionSort) => void;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		locale?: string;
		toolbar?: boolean;
		footer?: boolean;
		/** A member without edit rights sees no add, no row actions, no in-cell editors. */
		canEdit?: boolean;
		/** The page owns the selection, so it can clear it after a bulk action. */
		selection?: string[];
		emptyTitle?: string;
		emptyDescription?: string;
		emptyActionLabel?: string;
		onAdd?: () => void;
		/** Called when a row is opened, so the page can show its detail. */
		onOpenRow?: (row: TransactionRow) => void;
		onSelectionChange?: (ids: string[]) => void;
		onEditRow?: (row: TransactionRow) => void;
		onDeleteRow?: (row: TransactionRow) => void;
		/** In-cell edits. The page persists them; the cell only reports. */
		onCategoryChange?: (row: TransactionRow, categoryId: string) => void;
		onWalletChange?: (row: TransactionRow, walletId: string) => void;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		class?: string;
	} = $props();

	/**
	 * Uncontrolled unless the page says otherwise.
	 *
	 * The specimen in the design system has no URL to write to, so it keeps
	 * its own sort here. A real page passes `sort` and `onSortChange` and the
	 * server does the sorting, because sorting only the page you happen to
	 * have loaded is not sorting (D55).
	 */
	let localSort = $state<TransactionSort>({ key: null, descending: false });

	const controlled = $derived(onSortChange !== undefined);
	const sortKey = $derived(controlled ? (sort?.key ?? null) : localSort.key);
	const sortDescending = $derived(controlled ? (sort?.descending ?? false) : localSort.descending);

	let selected = $state<Record<string, boolean>>({});
	let collapsedGroups = $state<Record<string, boolean>>({});
	let rowCategory = $state<Record<string, string>>({});
	let rowWallet = $state<Record<string, string>>({});

	/**
	 * Column widths, which the handles on the header edges change.
	 *
	 * They live here rather than in the column spec so a drag can move one
	 * and a double click can put it back; a real page would also keep them
	 * per user, as the old app does in its table settings.
	 */
	let widths = $state<Record<string, number | undefined>>({});

	const visibleColumns = $derived(TRANSACTION_COLUMNS.filter((column) => !hidden[column.key]));
	const hideableColumns = TRANSACTION_COLUMNS.filter((column) => !column.fixed);

	const categoryOf = (row: TransactionRow) => rowCategory[row.id] ?? row.categoryId;
	const walletOf = (row: TransactionRow) => rowWallet[row.id] ?? row.walletId;
	const nameOfRow = (row: TransactionRow) => row.name;
	const amountOf = (row: TransactionRow) => row.amount;
	const nameOf = (options: NamedOption[], id: string) =>
		options.find((option) => option.id === id)?.name ?? id;

	/*
	 * Every figure below is a decimal string and stays one. The earlier
	 * version of this table scaled amounts to minor units with
	 * `parseFloat(amount) * 100`, which is the rounding D12 exists to
	 * prevent, and which silently truncates any rupiah figure past about
	 * ninety trillion. `$lib/money` compares and sums the digits instead.
	 */

	const matching = $derived(
		rows.filter((row) => {
			const haystack =
				`${nameOfRow(row)} ${nameOf(categories, categoryOf(row))} ${nameOf(wallets, walletOf(row))}`.toLowerCase();
			if (filters.search.trim() && !haystack.includes(filters.search.trim().toLowerCase())) {
				return false;
			}

			const categoryFilter = filters.facets.category ?? [];
			if (categoryFilter.length > 0 && !categoryFilter.includes(categoryOf(row))) return false;

			const walletFilter = filters.facets.wallet ?? [];
			if (walletFilter.length > 0 && !walletFilter.includes(walletOf(row))) return false;

			const size = absDecimal(amountOf(row));
			if (filters.amount?.min && compareDecimals(size, filters.amount.min) < 0) return false;
			if (filters.amount?.max && compareDecimals(size, filters.amount.max) > 0) return false;

			const range = filters.dateRange;
			if (range?.start) {
				const day = row.day;
				if (day < isoDay(range.start)) return false;
				if (range.end && day > isoDay(range.end)) return false;
			}

			return true;
		})
	);

	const sorted = $derived.by(() => {
		// When the page owns the sort, the server has already applied it.
		// Sorting again here would reorder only the rows fetched so far,
		// which with an accumulating list is a different list each time.
		if (controlled || sortKey === null) return matching;
		return [...matching].sort((a, b) => {
			const direction = sortDescending ? -1 : 1;
			if (sortKey === 'amount') return compareDecimals(amountOf(a), amountOf(b)) * direction;
			if (sortKey === 'name') return nameOfRow(a).localeCompare(nameOfRow(b)) * direction;
			return a.day.localeCompare(b.day) * direction || nameOfRow(a).localeCompare(nameOfRow(b));
		});
	});

	/**
	 * The rows divided into blocks, in the order they already sit in.
	 *
	 * Built by walking the sorted list rather than by collecting the keys and
	 * filtering per key: that was quadratic, and with three months of rows
	 * accumulating as the list scrolls it is the sort of thing that is fine
	 * until it is not.
	 */
	const blocks = $derived.by<RowGroup<TransactionRow>[] | undefined>(() => {
		if (grouping === 'none') return undefined;

		const built: RowGroup<TransactionRow>[] = [];
		for (const row of sorted) {
			const key = groupKey(row.day, grouping);
			const last = built.at(-1);
			if (last && last.key === key) last.rows.push(row);
			else built.push({ key, rows: [row] });
		}
		return built;
	});

	const selectedIds = $derived(sorted.filter((row) => selected[row.id]).map((row) => row.id));

	$effect(() => {
		selection = selectedIds;
		onSelectionChange?.(selectedIds);
	});

	/*
	 * The page clears the selection after a bulk action by emptying its own
	 * array; the checkboxes follow.
	 */
	$effect(() => {
		if (selection.length === 0 && Object.keys(selected).length > 0) selected = {};
	});

	const allSelected = $derived(sorted.length > 0 && selectedIds.length === sorted.length);
	const someSelected = $derived(selectedIds.length > 0 && !allSelected);

	const accountItems = $derived(wallets.map((wallet) => ({ id: wallet.id, label: wallet.name })));
	const categoryItems = $derived(
		categories.map((category) => ({
			id: category.id,
			label: category.name,
			colorClass: category.colorClass
		}))
	);

	const facets = $derived([
		{ id: 'category', label: 'Category', options: categories },
		{ id: 'wallet', label: 'Wallet', options: wallets }
	]);

	function isoDay(date: { toDate: (zone: string) => Date }): string {
		return date.toDate(getLocalTimeZone()).toISOString().slice(0, 10);
	}

	/** Ascending, then descending, then back to the order the rows came in. */
	function toggleSort(key: SortKey) {
		const next =
			sortKey !== key
				? { key, descending: false }
				: sortDescending
					? { key: null, descending: false }
					: { key, descending: true };

		if (onSortChange) onSortChange(next);
		else localSort = next;
	}

	function toggleAll(checked: boolean) {
		selected = checked ? Object.fromEntries(sorted.map((row) => [row.id, true])) : {};
	}

	/** The row's figure, in the wallet's own currency, signed (UI-7). */
	function money(row: TransactionRow): string {
		return formatMoney(amountOf(row), row.currency, { signed: true });
	}

	/**
	 * A day's total, per currency. Totalling across currencies would be
	 * arithmetic on amounts that are not comparable, so a day holding both
	 * rupiah and dollars shows both rather than one number that is wrong.
	 */
	function dayTotal(dayRows: TransactionRow[], direction: 'in' | 'out'): string {
		const wanted = dayRows.filter((row) => {
			const amount = amountOf(row);
			if (isZero(amount)) return false;
			return direction === 'in' ? !isNegative(amount) : isNegative(amount);
		});

		const byCurrency = new Map<string, string[]>();
		for (const row of wanted) {
			const held = byCurrency.get(row.currency) ?? [];
			held.push(absDecimal(amountOf(row)));
			byCurrency.set(row.currency, held);
		}

		if (byCurrency.size === 0) return formatMoney('0', dayRows[0]?.currency ?? 'IDR');

		return [...byCurrency]
			.map(([currency, amounts]) => formatMoney(addDecimals(amounts), currency))
			.join('  ');
	}

	const dayLabel = (key: string) => groupLabel(key, grouping, locale);

	/** The specimen's labels. A real page reads these from the dictionary. */
	const GROUPING_LABELS: Record<Grouping, string> = {
		none: 'None',
		daily: 'Daily',
		weekly: 'Weekly',
		monthly: 'Monthly'
	};
</script>

<div class={cn('flex h-full min-h-0 flex-col gap-3', className)}>
	<!-- ------------------------------------------------------- toolbar -->
	{#if toolbar}
		<div class="flex flex-wrap items-start gap-2">
			<DataTableFilter bind:filters {facets} class="flex-1" />

			<div class="flex items-center gap-2">
				<Select
					items={GROUPINGS.map((option) => ({ value: option, label: GROUPING_LABELS[option] }))}
					bind:value={grouping}
					searchable={false}
					class="w-36"
				/>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" size="icon" aria-label="Columns" {...props}>
								<Columns3 />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-44">
						<DropdownMenu.Label>Columns</DropdownMenu.Label>
						{#each hideableColumns as column (column.key)}
							<DropdownMenu.CheckboxItem
								checked={!hidden[column.key]}
								onCheckedChange={(on) => (hidden = { ...hidden, [column.key]: !on })}
							>
								{column.label}
							</DropdownMenu.CheckboxItem>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								<Download />
								Export
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-40">
						<DropdownMenu.Item>Export as CSV</DropdownMenu.Item>
						<DropdownMenu.Item disabled={selectedIds.length === 0}>Export selected</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Button onclick={onAdd}>
					<Plus />
					Add
				</Button>
			</div>
		</div>
	{/if}

	{#if toolbar && selectedIds.length > 0}
		<div class="bg-muted flex flex-wrap items-center gap-2 border px-3 py-2">
			<span class="text-body">{selectedIds.length} selected</span>
			<div class="ml-auto flex items-center gap-2">
				<Button size="sm" variant="outline">Edit category</Button>
				<Button size="sm" variant="outline">Export</Button>
				<Button size="sm" variant="destructive">Delete</Button>
				<Button size="sm" variant="ghost" onclick={() => (selected = {})}>Clear</Button>
			</div>
		</div>
	{/if}

	<!-- --------------------------------------------------------- table -->
	<DataTable
		columns={visibleColumns}
		rows={sorted}
		groups={blocks}
		label="Transactions"
		bind:widths
		bind:collapsed={collapsedGroups}
		columnArrows
		{hasMore}
		{loadingMore}
		loadingMoreLabel="Loading more"
		{onLoadMore}
		onRowClick={(row) => onOpenRow?.(row)}
		rowClass={(row) => (selected[row.id] ? 'bg-row-hover' : undefined)}
	>
		{#snippet head(column, arrows)}
			{#if column.key === 'select'}
				<div class="flex h-full w-full items-center justify-center">
					<Checkbox
						checked={allSelected}
						indeterminate={someSelected}
						onCheckedChange={(checked) => toggleAll(checked === true)}
						aria-label="Select every row"
					/>
				</div>
			{:else if column.key === 'actions'}
				<span class="sr-only">Actions</span>
			{:else}
				<div class="flex w-full items-center justify-between overflow-hidden">
					<div class="min-w-0 overflow-hidden">
						{#if column.sortable}
							<Button
								variant="ghost"
								class="max-w-full min-w-0 p-0 hover:bg-transparent"
								onclick={() => toggleSort(column.key as SortKey)}
							>
								<span class="truncate">{column.label}</span>
								{#if sortKey === column.key && !sortDescending}
									<ArrowDown class="size-4" />
								{:else if sortKey === column.key}
									<ArrowUp class="size-4" />
								{/if}
							</Button>
						{:else}
							<span class="truncate">{column.label}</span>
						{/if}
					</div>

					<!--
						The columns that scroll start at the last sticky one, so
						that is where the shell offers the arrows: at the seam,
						not at the far edge where they would scroll away with the
						content.
					-->
					{#if arrows}{@render arrows()}{/if}
				</div>
			{/if}
		{/snippet}

		{#snippet cell(column, row)}
			{#if column.key === 'select'}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="flex h-full w-full items-center justify-center"
					onclick={(event) => event.stopPropagation()}
				>
					<Checkbox
						checked={selected[row.id] ?? false}
						onCheckedChange={(checked) =>
							(selected = { ...selected, [row.id]: checked === true })}
						aria-label="Select {nameOfRow(row)}"
					/>
				</div>
			{:else if column.key === 'date'}
				<div class="w-full truncate overflow-hidden">{row.date}</div>
			{:else if column.key === 'name'}
				<div class="flex w-full items-center gap-2 overflow-hidden">
					<span class="truncate">{row.name}</span>
				</div>
			{:else if column.key === 'category'}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div class="h-full w-full" onclick={(event) => event.stopPropagation()}>
					<SelectCategory
						categories={categoryItems}
						value={categoryOf(row)}
						disabled={!canEdit}
						creatable={canEdit}
						type={isNegative(row.amount) ? 'expense' : 'income'}
						{createLabel}
						onChange={(value) => {
							rowCategory = { ...rowCategory, [row.id]: value };
							onCategoryChange?.(row, value);
						}}
						inDataTable
					/>
				</div>
			{:else if column.key === 'account'}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div class="h-full w-full" onclick={(event) => event.stopPropagation()}>
					<SelectAccount
						accounts={accountItems}
						value={walletOf(row)}
						disabled={!canEdit}
						creatable={canEdit}
						{createLabel}
						onChange={(value) => {
							rowWallet = { ...rowWallet, [row.id]: value };
							onWalletChange?.(row, value);
						}}
						inDataTable
					/>
				</div>
			{:else if column.key === 'amount'}
				<div class="w-full overflow-hidden text-right">
					<!-- The wallet-currency figure is the primary one: it is what
					     moved the wallet. The whole figure is coloured, and the
					     sign is there too, so colour is never the only carrier
					     (UI-7). -->
					<div class={cn('truncate font-mono', isNegative(row.amount) ? 'text-red' : 'text-green')}>
						{money(row)}
					</div>
					{#if row.originalAmount && row.originalCurrency}
						<!-- What the user typed, muted beside it (TXN-21). A row
						     entered in the wallet's own currency shows one line. -->
						<div class="text-subtle truncate font-mono text-xs">
							{formatMoney(row.originalAmount, row.originalCurrency)}
						</div>
					{/if}
					{#if row.staleRate}
						<div
							class="text-subtle truncate text-xs"
							title="Converted at the rate for {row.staleRateDate}, the newest one available."
						>
							rate {row.staleRateDate}
						</div>
					{/if}
				</div>
			{:else}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="flex h-full w-full items-center justify-center"
					onclick={(event) => event.stopPropagation()}
				>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									aria-label="Actions for {nameOfRow(row)}"
									{...props}
								>
									<Ellipsis />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-40">
							<DropdownMenu.Item onclick={() => onOpenRow?.(row)}>Open</DropdownMenu.Item>
							{#if canEdit}
								<DropdownMenu.Item onclick={() => onEditRow?.(row)}>Edit</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item class="text-destructive" onclick={() => onDeleteRow?.(row)}>
									Delete
								</DropdownMenu.Item>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{/if}
		{/snippet}

		{#snippet groupRow({ key, rows: dayRows, collapsed, toggle })}
			<button
				type="button"
				class="text-subtle text-small flex items-center gap-1"
				aria-expanded={!collapsed}
				onclick={toggle}
			>
				{#if collapsed}
					<ChevronRight class="size-3" />
				{:else}
					<ChevronDown class="size-3" />
				{/if}
				{dayLabel(key)}
			</button>
			<span class="text-green text-small ml-auto font-mono">{dayTotal(dayRows, 'in')}</span>
			<span class="text-red text-small font-mono">{dayTotal(dayRows, 'out')}</span>
		{/snippet}

		{#snippet empty()}
			<!-- Two empty states, not one: "none yet" and "none matching" need
			     different words and different next steps (UI-2). -->
			<DataTableEmptyState
				title={emptyTitle}
				description={emptyDescription}
				actionLabel={canEdit ? emptyActionLabel : undefined}
				onAction={onAdd}
			/>
		{/snippet}
	</DataTable>

	<!-- The specimen's own footer. A page with server pagination owns the
	     count and the steps itself and passes `footer={false}`, or the two
	     disagree about how many rows there are. -->
	{#if footer}
		<div class="text-subtle text-small flex items-center justify-between gap-4">
			<span>
				{#if selectedIds.length > 0}{selectedIds.length} selected,&nbsp;{/if}{sorted.length ===
				rows.length
					? `${rows.length} transactions`
					: `${sorted.length} of ${rows.length} transactions`}
			</span>
			<div class="flex items-center gap-2">
				<Button size="sm" variant="outline" disabled>Previous</Button>
				<span>Page 1 of 1</span>
				<Button size="sm" variant="outline" disabled>Next</Button>
			</div>
		</div>
	{/if}
</div>
