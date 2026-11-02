<script lang="ts">
	/**
	 * The transactions table (US-017), ported from the old app's
	 * organisms/data-table plus the transactions page that configures it.
	 *
	 * The old table is not a browser-laid-out grid: every row is a flex row of
	 * fixed-width cells 45px tall, the last visible column flexes to fill, and
	 * the rule is drawn on the cell. That is what makes the columns line up
	 * while the body scrolls horizontally, so it is kept here exactly, class
	 * for class, including the hover colour (#F2F1EF, #0f0f0f in the dark).
	 *
	 * What is deliberately not ported: TanStack Table, row virtualisation,
	 * column drag and drop and the resize handle. Those are a dependency and
	 * roughly two thousand lines for behaviour this table does not have yet;
	 * US-017 can add them when the row count calls for it.
	 *
	 * It holds no data and fetches nothing. Rows come in as a prop, already
	 * formatted by the API, and amounts stay decimal strings: sums are done on
	 * integer minor units, never on floats (D12).
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
	import * as Select from '../../atoms/select/index.js';
	import { Combobox } from '../../molecules/combobox/index.js';
	import { DataTableFilter } from '../data-table-filter/index.js';
	import { emptyFilterState, type DataTableFilterState } from '../data-table-filter/index.js';
	import DataTableEmptyState from './data-table-empty-state.svelte';
	import { ROW_HEIGHT, TRANSACTION_COLUMNS, type ColumnKey } from './columns.js';
	import type { NamedOption, TransactionRow } from './types.js';
	import { cn } from '$lib/utils.js';

	let {
		rows,
		categories,
		wallets,
		filters = $bindable(emptyFilterState()),
		grouping = $bindable('day'),
		locale = 'en-GB',
		onAdd,
		class: className
	}: {
		rows: TransactionRow[];
		categories: NamedOption[];
		wallets: NamedOption[];
		filters?: DataTableFilterState;
		grouping?: 'day' | 'none';
		locale?: string;
		onAdd?: () => void;
		class?: string;
	} = $props();

	type SortKey = 'date' | 'name' | 'amount';

	let sortKey = $state<SortKey>('date');
	let sortDescending = $state(true);
	let selected = $state<Record<string, boolean>>({});
	let expandedRow = $state<string | null>(null);
	let collapsedGroups = $state<Record<string, boolean>>({});
	let rowCategory = $state<Record<string, string>>({});
	let hidden = $state<Partial<Record<ColumnKey, boolean>>>({});

	const visibleColumns = $derived(TRANSACTION_COLUMNS.filter((column) => !hidden[column.key]));
	const hideableColumns = TRANSACTION_COLUMNS.filter((column) => !column.fixed);
	/** The last column before the actions column stretches, as the old row does. */
	const flexingKey = $derived(
		visibleColumns.filter((column) => column.key !== 'actions').at(-1)?.key
	);
	const totalWidth = $derived(visibleColumns.reduce((sum, column) => sum + column.width, 0));

	const categoryOf = (row: TransactionRow) => rowCategory[row.id] ?? row.categoryId;
	const nameOf = (options: NamedOption[], id: string) =>
		options.find((option) => option.id === id)?.name ?? id;
	const colourOf = (id: string) =>
		categories.find((category) => category.id === id)?.colorClass ?? 'bg-subtle';

	/** Minor units, so a sum never touches a float (D12). */
	const minorUnits = (amount: string) => Math.round(parseFloat(amount) * 100);

	const matching = $derived(
		rows.filter((row) => {
			const haystack =
				`${row.name} ${nameOf(categories, categoryOf(row))} ${nameOf(wallets, row.walletId)}`.toLowerCase();
			if (filters.search.trim() && !haystack.includes(filters.search.trim().toLowerCase())) {
				return false;
			}

			const categoryFilter = filters.facets.category ?? [];
			if (categoryFilter.length > 0 && !categoryFilter.includes(categoryOf(row))) return false;

			const walletFilter = filters.facets.wallet ?? [];
			if (walletFilter.length > 0 && !walletFilter.includes(row.walletId)) return false;

			const size = Math.abs(minorUnits(row.amount));
			const min = filters.amount?.min ? minorUnits(filters.amount.min) : undefined;
			const max = filters.amount?.max ? minorUnits(filters.amount.max) : undefined;
			if (min !== undefined && size < min) return false;
			if (max !== undefined && size > max) return false;

			const range = filters.dateRange;
			if (range?.start) {
				const day = row.day;
				if (day < isoDay(range.start)) return false;
				if (range.end && day > isoDay(range.end)) return false;
			}

			return true;
		})
	);

	const sorted = $derived(
		[...matching].sort((a, b) => {
			const direction = sortDescending ? -1 : 1;
			if (sortKey === 'amount') return (minorUnits(a.amount) - minorUnits(b.amount)) * direction;
			if (sortKey === 'name') return a.name.localeCompare(b.name) * direction;
			return a.day.localeCompare(b.day) * direction || a.name.localeCompare(b.name);
		})
	);

	const groups = $derived(
		grouping === 'none'
			? [{ day: '', rows: sorted }]
			: [...new Set(sorted.map((r) => r.day))].map((day) => ({
					day,
					rows: sorted.filter((r) => r.day === day)
				}))
	);

	const selectedIds = $derived(sorted.filter((r) => selected[r.id]).map((r) => r.id));
	const allSelected = $derived(sorted.length > 0 && selectedIds.length === sorted.length);
	const someSelected = $derived(selectedIds.length > 0 && !allSelected);

	const facets = $derived([
		{ id: 'category', label: 'Category', options: categories },
		{ id: 'wallet', label: 'Wallet', options: wallets }
	]);

	const dayFormatter = $derived(
		new Intl.DateTimeFormat(locale, {
			weekday: 'long',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		})
	);

	function isoDay(date: { toDate: (zone: string) => Date }): string {
		return date.toDate(getLocalTimeZone()).toISOString().slice(0, 10);
	}

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDescending = !sortDescending;
		} else {
			sortKey = key;
			sortDescending = true;
		}
	}

	function toggleAll(checked: boolean) {
		selected = checked ? Object.fromEntries(sorted.map((r) => [r.id, true])) : {};
	}

	function toggleExpanded(id: string) {
		expandedRow = expandedRow === id ? null : id;
	}

	function money(row: TransactionRow): string {
		const value = parseFloat(row.amount);
		const sign = value > 0 ? '+' : '-';
		const absolute = Math.abs(value);
		const formatted =
			row.currency === '$'
				? absolute.toFixed(2).replace('.', ',')
				: absolute.toLocaleString('de-DE');
		return `${sign}${row.currency} ${formatted}`;
	}

	/**
	 * A day's total, per currency. Totalling across currencies would be
	 * arithmetic on amounts that are not comparable, so a day holding both
	 * rupiah and dollars shows both rather than one number that is wrong.
	 */
	function dayTotal(dayRows: TransactionRow[], direction: 'in' | 'out'): string {
		const wanted = dayRows.filter((r) =>
			direction === 'in' ? parseFloat(r.amount) > 0 : parseFloat(r.amount) < 0
		);
		const byCurrency = new Map<string, number>();
		for (const row of wanted) {
			byCurrency.set(
				row.currency,
				(byCurrency.get(row.currency) ?? 0) + Math.abs(minorUnits(row.amount))
			);
		}
		if (byCurrency.size === 0) return 'Rp 0';
		return [...byCurrency]
			.map(([currency, total]) =>
				currency === '$'
					? `$ ${(total / 100).toFixed(2).replace('.', ',')}`
					: `${currency} ${(total / 100).toLocaleString('de-DE')}`
			)
			.join('  ');
	}

	const dayLabel = (day: string) => dayFormatter.format(new Date(`${day}T00:00:00`)).toUpperCase();

	/** The width of a cell, or nothing when it is the column that flexes. */
	function cellStyle(key: ColumnKey): string {
		const column = TRANSACTION_COLUMNS.find((c) => c.key === key);
		if (!column) return '';
		if (key === flexingKey) return 'flex: 1 1 0%; min-width: 0;';
		return `width: ${column.width}px; min-width: ${column.width}px; max-width: ${column.width}px; flex-shrink: 0;`;
	}

	const CELL = 'h-full flex items-center border-b border-border overflow-hidden bg-background transition-colors group-hover:bg-[#F2F1EF] dark:group-hover:bg-[#0f0f0f]';
	// The header's colour and weight come from the old Table head atom, which
	// this layout replaces: #666666 at 500, measured on the live app.
	const HEAD =
		'text-subtle relative flex h-full items-center border-t border-b border-border bg-background px-4 font-medium';
</script>

<div class={cn('space-y-3', className)}>
	<!-- ------------------------------------------------------- toolbar -->
	<div class="flex flex-wrap items-start gap-2">
		<DataTableFilter bind:filters {facets} class="flex-1" />

		<div class="flex items-center gap-2">
			<Select.Root type="single" bind:value={grouping}>
				<Select.Trigger class="w-36">
					{grouping === 'day' ? 'Group by day' : 'No grouping'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="day">Group by day</Select.Item>
					<Select.Item value="none">No grouping</Select.Item>
				</Select.Content>
			</Select.Root>

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

	{#if selectedIds.length > 0}
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
	<div class="w-full overflow-x-auto">
		<div style="min-width: {totalWidth}px">
			<!-- Header: its own block, as the old table keeps it, so the body
			     can scroll under it without the columns drifting. -->
			<div class="bg-background sticky top-0 z-30 block w-full border-0">
				<div class="flex h-[45px] w-full min-w-full items-center" role="row">
					{#each visibleColumns as column (column.key)}
						{#if column.key === 'select'}
							<div class={cn(HEAD, 'px-0')} style={cellStyle('select')} role="columnheader">
								<div class="flex h-full w-full items-center justify-center">
									<Checkbox
										checked={allSelected}
										indeterminate={someSelected}
										onCheckedChange={(checked) => toggleAll(checked === true)}
										aria-label="Select every row"
									/>
								</div>
							</div>
						{:else if column.key === 'actions'}
							<div
								class={cn(HEAD, 'justify-center')}
								style={cellStyle('actions')}
								role="columnheader"
							></div>
						{:else}
							<div
								id={column.key === 'date' ? 'spec-head' : undefined}
								class={cn(HEAD, column.alignRight && 'justify-end')}
								style={cellStyle(column.key)}
								role="columnheader"
							>
								{#if column.sortable}
									<Button
										variant="ghost"
										class="max-w-full min-w-0 space-x-2 p-0 hover:bg-transparent"
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
						{/if}
					{/each}
				</div>
			</div>

			{#if sorted.length === 0}
				<div class="border-border border-b">
					<DataTableEmptyState
						title="No transactions"
						description="Nothing matches these filters. Clear one, or widen the date range."
						actionLabel="Add transaction"
						onAction={onAdd}
					/>
				</div>
			{/if}

			{#each groups as group, groupIndex (group.day)}
				{#if group.day}
					<!-- The day group row: the one row that spans every column. -->
					<div
						id={groupIndex === 0 ? 'spec-group-row' : undefined}
						class="border-border flex h-[40px] w-full min-w-full items-center gap-2 border-b bg-[rgb(251,251,250)] px-4 dark:bg-[rgb(20,20,20)]"
					>
						<button
							type="button"
							class="text-subtle text-small flex items-center gap-1"
							aria-expanded={!collapsedGroups[group.day]}
							onclick={() =>
								(collapsedGroups = {
									...collapsedGroups,
									[group.day]: !collapsedGroups[group.day]
								})}
						>
							{#if collapsedGroups[group.day]}
								<ChevronRight class="size-3" />
							{:else}
								<ChevronDown class="size-3" />
							{/if}
							{dayLabel(group.day)}
						</button>
						<span class="text-green text-small ml-auto font-mono">
							{dayTotal(group.rows, 'in')}
						</span>
						<span class="text-red text-small font-mono">{dayTotal(group.rows, 'out')}</span>
					</div>
				{/if}

				{#if !collapsedGroups[group.day]}
					{#each group.rows as row (row.id)}
						<!--
							The whole row opens the detail. Cells that do something of
							their own stop the event, so a checkbox, the category editor
							and the actions menu do not also expand the row.
						-->
						<div
							id={row.id === sorted[0]?.id ? 'spec-row' : undefined}
							role="row"
							tabindex="0"
							aria-expanded={expandedRow === row.id}
							class={cn(
								'group flex w-full min-w-full cursor-pointer items-center border-0 select-text',
								'hover:bg-[#F2F1EF] dark:hover:bg-[#0f0f0f]',
								selected[row.id] && 'bg-[#F2F1EF] dark:bg-[#0f0f0f]'
							)}
							style="height: {ROW_HEIGHT}px"
							onclick={() => toggleExpanded(row.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									toggleExpanded(row.id);
								}
							}}
						>
							{#each visibleColumns as column (column.key)}
								{#if column.key === 'select'}
									<div class={cn(CELL, 'px-0')} style={cellStyle('select')} role="cell">
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div class="flex h-full w-full items-center" onclick={(event) => event.stopPropagation()}>
										<div class="flex h-full w-full items-center justify-center">
											<Checkbox
												checked={selected[row.id] ?? false}
												onCheckedChange={(checked) =>
													(selected = { ...selected, [row.id]: checked === true })}
												aria-label="Select {row.name}"
											/>
										</div>
										</div>
									</div>
								{:else if column.key === 'date'}
									<div
										id={row.id === sorted[0]?.id ? 'spec-cell' : undefined}
										class={cn(CELL, 'px-4')}
										style={cellStyle('date')}
										role="cell"
									>
										<div class="w-full truncate overflow-hidden">{row.date}</div>
									</div>
								{:else if column.key === 'name'}
									<div class={cn(CELL, 'px-4')} style={cellStyle('name')} role="cell">
										<div class="flex w-full items-center gap-2 overflow-hidden">
											<button
												type="button"
												class="text-subtle hover:text-foreground flex size-5 shrink-0 items-center justify-center"
												aria-expanded={expandedRow === row.id}
												aria-label="{expandedRow === row.id
													? 'Collapse'
													: 'Expand'} {row.name}"
												onclick={(event) => {
													event.stopPropagation();
													toggleExpanded(row.id);
												}}
											>
												{#if expandedRow === row.id}
													<ChevronDown class="size-3.5" />
												{:else}
													<ChevronRight class="size-3.5" />
												{/if}
											</button>
											<span class="truncate">{row.name}</span>
										</div>
									</div>
								{:else if column.key === 'category'}
									<div class={cn(CELL, 'px-4')} style={cellStyle('category')} role="cell">
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div class="flex h-full w-full items-center" onclick={(event) => event.stopPropagation()}>
										<div class="flex w-full items-center gap-2 overflow-hidden">
											<span
												class={cn('inline-block size-2 shrink-0', colourOf(categoryOf(row)))}
												aria-hidden="true"
											></span>
											<Combobox
												id={row.id === sorted[0]?.id ? 'spec-incell' : undefined}
												options={categories.map((c) => ({ value: c.id, label: c.name }))}
												value={categoryOf(row)}
												onValueChange={(value) =>
													(rowCategory = { ...rowCategory, [row.id]: value })}
												inline
											/>
										</div>
										</div>
									</div>
								{:else if column.key === 'wallet'}
									<div class={cn(CELL, 'px-4')} style={cellStyle('wallet')} role="cell">
										<div class="w-full truncate overflow-hidden">
											{nameOf(wallets, row.walletId)}
										</div>
									</div>
								{:else if column.key === 'amount'}
									<div
										class={cn(CELL, 'justify-end px-4')}
										style={cellStyle('amount')}
										role="cell"
									>
										<div
											class={cn(
												'w-full truncate overflow-hidden text-right font-mono',
												parseFloat(row.amount) > 0 ? 'text-green' : 'text-red'
											)}
										>
											{money(row)}
										</div>
									</div>
								{:else}
									<div class={cn(CELL, 'justify-center px-4')} style={cellStyle('actions')} role="cell">
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div class="flex h-full w-full items-center" onclick={(event) => event.stopPropagation()}>
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}
													<Button
														variant="ghost"
														size="icon"
														class="size-7"
														aria-label="Actions for {row.name}"
														{...props}
													>
														<Ellipsis />
													</Button>
												{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end" class="w-40">
												<DropdownMenu.Item>Edit</DropdownMenu.Item>
												<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
												<DropdownMenu.Separator />
												<DropdownMenu.Item class="text-destructive">Delete</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
										</div>
									</div>
								{/if}
							{/each}
						</div>

						{#if expandedRow === row.id}
							<div class="border-border bg-muted/40 w-full min-w-full border-b px-4 py-3">
								<div class="space-y-3">
									<dl class="text-body grid gap-x-8 gap-y-1 sm:grid-cols-4">
										<div>
											<dt class="text-subtle text-small">Note</dt>
											<dd>{row.note ?? 'No note'}</dd>
										</div>
										<div>
											<dt class="text-subtle text-small">Wallet</dt>
											<dd>{nameOf(wallets, row.walletId)}</dd>
										</div>
										<div>
											<dt class="text-subtle text-small">Category</dt>
											<dd>{nameOf(categories, categoryOf(row))}</dd>
										</div>
										<div>
											<dt class="text-subtle text-small">Amount</dt>
											<dd class="font-mono">{money(row)}</dd>
										</div>
									</dl>
									<div class="flex gap-2">
										<Button size="sm" variant="outline">Open</Button>
										<Button size="sm" variant="outline">Attach receipt</Button>
									</div>
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			{/each}
		</div>
	</div>

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
</div>
