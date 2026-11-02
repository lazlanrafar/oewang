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
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
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
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import { DataTableFilter } from '../data-table-filter/index.js';
	import { emptyFilterState, type DataTableFilterState } from '../data-table-filter/index.js';
	import DataTableEmptyState from './data-table-empty-state.svelte';
	import {
		ROW_HEIGHT,
		TRANSACTION_COLUMNS,
		type ColumnKey,
		type ColumnSpec
	} from './columns.js';
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
	let rowWallet = $state<Record<string, string>>({});

	/**
	 * Column widths, which the handles on the header edges change.
	 *
	 * A width lives here rather than in the column spec so a drag can move it
	 * and a double click can put it back; a real page would also keep it per
	 * user, as the old app does in its table settings.
	 */
	let widths = $state<Partial<Record<ColumnKey, number>>>({});
	let resizing = $state<ColumnKey | null>(null);

	/*
	 * Horizontal scrolling, with the arrows the old table puts in its last
	 * sticky column. They step by a column rather than by a fixed distance,
	 * so a press always lands on a column boundary instead of halfway through
	 * one, which is what `use-table-scroll` does with `useColumnWidths`.
	 */
	let scroller = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	let isScrollable = $state(false);

	$effect(() => {
		// Re-read when the columns change: hiding one can stop the table
		// being scrollable at all.
		totalWidth;
		readScroll();
	});

	function readScroll() {
		if (!scroller) return;
		const max = scroller.scrollWidth - scroller.clientWidth;
		isScrollable = max > 1;
		canScrollLeft = scroller.scrollLeft > 1;
		canScrollRight = scroller.scrollLeft < max - 1;
	}

	/** The left edge of every column, in scroll coordinates. */
	function columnEdges(): number[] {
		const edges: number[] = [];
		let left = 0;
		for (const column of visibleColumns) {
			edges.push(left);
			left += widthOf(column);
		}
		return edges;
	}

	function scrollByColumn(direction: -1 | 1) {
		if (!scroller) return;
		const edges = columnEdges();
		const current = scroller.scrollLeft;
		const next =
			direction === 1
				? edges.find((edge) => edge > current + 1)
				: [...edges].reverse().find((edge) => edge < current - 1);
		scroller.scrollTo({ left: next ?? (direction === 1 ? scroller.scrollWidth : 0) });
	}
	let hidden = $state<Partial<Record<ColumnKey, boolean>>>({});

	const visibleColumns = $derived(TRANSACTION_COLUMNS.filter((column) => !hidden[column.key]));
	const hideableColumns = TRANSACTION_COLUMNS.filter((column) => !column.fixed);
	const totalWidth = $derived(visibleColumns.reduce((sum, column) => sum + widthOf(column), 0));
	/** The arrows live on the last column that stays put while the rest move. */
	const lastStickyKey = $derived(visibleColumns.filter((column) => column.stickyLeft).at(-1)?.key);

	const categoryOf = (row: TransactionRow) => rowCategory[row.id] ?? row.categoryId;
	const walletOf = (row: TransactionRow) => rowWallet[row.id] ?? row.walletId;
	const nameOfRow = (row: TransactionRow) => row.name;
	const amountOf = (row: TransactionRow) => row.amount;
	const nameOf = (options: NamedOption[], id: string) =>
		options.find((option) => option.id === id)?.name ?? id;
	const colourOf = (id: string) =>
		categories.find((category) => category.id === id)?.colorClass ?? 'bg-subtle';

	/** Minor units, so a sum never touches a float (D12). */
	const minorUnits = (amount: string) => Math.round(parseFloat(amount) * 100);

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

			const size = Math.abs(minorUnits(amountOf(row)));
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
			if (sortKey === 'amount') return (minorUnits(amountOf(a)) - minorUnits(amountOf(b))) * direction;
			if (sortKey === 'name') return nameOfRow(a).localeCompare(nameOfRow(b)) * direction;
			return a.day.localeCompare(b.day) * direction || nameOfRow(a).localeCompare(nameOfRow(b));
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

	const accountItems = $derived(wallets.map((w) => ({ id: w.id, label: w.name })));
	const categoryItems = $derived(
		categories.map((c) => ({ id: c.id, label: c.name, colorClass: c.colorClass }))
	);

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
		const value = parseFloat(amountOf(row));
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
			direction === 'in' ? parseFloat(amountOf(r)) > 0 : parseFloat(amountOf(r)) < 0
		);
		const byCurrency = new Map<string, number>();
		for (const row of wanted) {
			byCurrency.set(
				row.currency,
				(byCurrency.get(row.currency) ?? 0) + Math.abs(minorUnits(amountOf(row)))
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

	const widthOf = (column: ColumnSpec) => widths[column.key] ?? column.width;

	/**
	 * A sticky column's offset is the sum of the sticky columns before it, so
	 * hiding or resizing one moves the rest. The old app computes the same
	 * number into `--stick-left`.
	 */
	const stickyOffsets = $derived.by(() => {
		const offsets: Partial<Record<ColumnKey, number>> = {};
		let left = 0;
		for (const column of visibleColumns) {
			if (!column.stickyLeft) continue;
			offsets[column.key] = left;
			left += widthOf(column);
		}
		return offsets;
	});

	/** Width, and the offset that makes a sticky column stay put. */
	function cellStyle(key: ColumnKey): string {
		const column = visibleColumns.find((c) => c.key === key);
		if (!column) return '';
		const width = widthOf(column);
		const size = `width: ${width}px; min-width: ${width}px; max-width: ${width}px; flex-shrink: 0;`;
		if (column.stickyLeft) return `${size} left: ${stickyOffsets[key] ?? 0}px;`;
		return size;
	}

	function stickyClass(column: ColumnSpec): string {
		if (column.stickyLeft) return 'sticky z-20';
		if (column.stickyRight) return 'sticky right-0 z-20 border-r-0 border-l border-border';
		return '';
	}

	/** The rule belongs between columns, not on the table's outer edge. */
	const lastColumnKey = $derived(visibleColumns.at(-1)?.key);
	const edgeClass = (column: ColumnSpec) => (column.key === lastColumnKey ? 'border-r-0' : '');

	/**
	 * Dragging a header's right edge resizes that column; a double click puts
	 * it back to the measured width. The pointer is captured so the drag
	 * survives leaving the 4px handle, which is the whole difficulty here.
	 */
	function startResize(event: PointerEvent, column: ColumnSpec) {
		event.preventDefault();
		event.stopPropagation();
		const handle = event.currentTarget as HTMLElement;
		const startX = event.clientX;
		const startWidth = widthOf(column);
		resizing = column.key;
		handle.setPointerCapture(event.pointerId);

		const move = (move: PointerEvent) => {
			const next = Math.max(column.minWidth, startWidth + (move.clientX - startX));
			widths = { ...widths, [column.key]: Math.round(next) };
		};
		const stop = () => {
			resizing = null;
			handle.releasePointerCapture(event.pointerId);
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', stop);
			handle.removeEventListener('pointercancel', stop);
		};

		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', stop);
		handle.addEventListener('pointercancel', stop);
	}

	/**
	 * The keyboard's version of the drag: the arrows step the width by 16px,
	 * Home puts it back. Announced through the handle's own label, so there is
	 * nothing to learn beyond "this is the Description column's handle".
	 */
	function nudgeWidth(event: KeyboardEvent, column: ColumnSpec) {
		const step = event.shiftKey ? 64 : 16;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			widths = {
				...widths,
				[column.key]: Math.max(column.minWidth, widthOf(column) + direction * step)
			};
		} else if (event.key === 'Home') {
			event.preventDefault();
			resetWidth(column);
		}
	}

	function resetWidth(column: ColumnSpec) {
		const { [column.key]: _removed, ...rest } = widths;
		widths = rest;
	}

	// A rule on the right of every cell as well as under it, which is what
	// gives the live table its grid; the last column drops it, since that edge
	// is the table's own.
	const CELL =
		'h-full flex items-center border-r border-b border-border overflow-hidden bg-background transition-colors group-hover:bg-row-hover';
	// The header's colour and weight come from the old Table head atom, which
	// this layout replaces: #666666 at 500, measured on the live app.
	const HEAD =
		'text-subtle relative flex h-full items-center border-t border-r border-b border-border bg-background px-4 font-medium';
</script>

<svelte:window onresize={readScroll} />

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
	<div class="w-full overflow-x-auto" bind:this={scroller} onscroll={readScroll}>
		<!--
			The roles have to sit inside a table to mean anything: a `row` with
			no `table` ancestor is dropped, and a screen reader is handed a pile
			of divs with no column names and no counts.
		-->
		<div
			role="table"
			aria-label="Transactions"
			aria-rowcount={sorted.length}
			aria-colcount={visibleColumns.length}
			style="min-width: {totalWidth}px"
		>
			<!-- Header: its own block, as the old table keeps it, so the body
			     can scroll under it without the columns drifting. -->
			<div role="rowgroup" class="bg-background sticky top-0 z-30 block w-full border-0">
				<div class="flex h-[45px] w-full min-w-full items-center" role="row">
					{#each visibleColumns as column (column.key)}
						<div
							id={column.key === 'date' ? 'spec-head' : undefined}
							class={cn(
								HEAD,
								stickyClass(column),
								edgeClass(column),
								column.key === 'select' && 'px-0',
								column.key === 'actions' && 'justify-center',
								column.alignRight && 'justify-end'
							)}
							style={cellStyle(column.key)}
							role="columnheader"
						>
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

									{#if column.key === lastStickyKey && isScrollable}
										<!--
											The columns that scroll start here, so this is where the
											old table puts the arrows: at the seam, not at the far
											edge where they would scroll away with the content.
										-->
										<div class="hidden shrink-0 items-center space-x-2 md:flex">
											<Button
												variant="outline"
												size="sm"
												class="size-6 p-0"
												disabled={!canScrollLeft}
												aria-label="Scroll columns left"
												onclick={() => scrollByColumn(-1)}
											>
												<ArrowLeft class={cn('size-3.5', canScrollLeft && 'text-primary')} />
											</Button>
											<Button
												variant="outline"
												size="sm"
												class="size-6 p-0"
												disabled={!canScrollRight}
												aria-label="Scroll columns right"
												onclick={() => scrollByColumn(1)}
											>
												<ArrowRight
													class={cn('size-3.5', canScrollRight && 'text-primary')}
												/>
											</Button>
										</div>
									{/if}
								</div>
							{/if}

							{#if column.resizable}
								<!--
									The resize handle: 4px wide, sitting on the column's right
									edge and half outside it, exactly as the old table draws it.
									A drag changes the width, a double click puts it back.

									It is a button rather than a bare div, so the arrow keys
									reach it: dragging was the only way to resize a column, and
									a pointer-only control is no control for half the users.
								-->
								<button
									type="button"
									class={cn(
										'absolute top-0 right-0 h-full w-1 translate-x-1/2 cursor-col-resize touch-none select-none',
										resizing === column.key ? 'bg-primary' : 'bg-transparent hover:bg-border'
									)}
									aria-label="Resize {column.label}"
									onpointerdown={(event) => startResize(event, column)}
									ondblclick={() => resetWidth(column)}
									onkeydown={(event) => nudgeWidth(event, column)}
								></button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div role="rowgroup">
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
						class="border-border bg-row-group flex h-[40px] w-full min-w-full items-center gap-2 border-b px-4"
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
						<!--
							The row opens its detail on click as a pointer convenience.
							It is not a widget: the chevron button beside the description
							carries the name, the state and the keyboard path, so the row
							itself stays out of the tab order and announces nothing extra.
						-->
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_interactive_supports_focus -->
						<div
							id={row.id === sorted[0]?.id ? 'spec-row' : undefined}
							role="row"
							class={cn(
								'group flex w-full min-w-full cursor-pointer items-center border-0 select-text',
								'hover:bg-row-hover',
								selected[row.id] && 'bg-row-hover'
							)}
							style="height: {ROW_HEIGHT}px"
							onclick={() => toggleExpanded(row.id)}
						>
							{#each visibleColumns as column (column.key)}
								{#if column.key === 'select'}
									<div
										class={cn(CELL, stickyClass(column), edgeClass(column), 'px-0')}
										style={cellStyle('select')}
										role="cell"
									>
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div class="flex h-full w-full items-center" onclick={(event) => event.stopPropagation()}>
										<div class="flex h-full w-full items-center justify-center">
											<Checkbox
												checked={selected[row.id] ?? false}
												onCheckedChange={(checked) =>
													(selected = { ...selected, [row.id]: checked === true })}
												aria-label="Select {nameOfRow(row)}"
											/>
										</div>
										</div>
									</div>
								{:else if column.key === 'date'}
									<div
										id={row.id === sorted[0]?.id ? 'spec-cell' : undefined}
										class={cn(CELL, stickyClass(column), edgeClass(column), 'px-4')}
										style={cellStyle('date')}
										role="cell"
									>
										<div class="w-full truncate overflow-hidden">{row.date}</div>
									</div>
								{:else if column.key === 'name'}
									<div
										class={cn(CELL, stickyClass(column), edgeClass(column), 'px-4')}
										style={cellStyle('name')}
										role="cell"
									>
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
									<div
										class={cn(CELL, edgeClass(column), 'p-0')}
										style={cellStyle('category')}
										role="cell"
									>
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div
											class="h-full w-full"
											onclick={(event) => event.stopPropagation()}
										>
											<SelectCategory
												id={row.id === sorted[0]?.id ? 'spec-incell' : undefined}
												categories={categoryItems}
												value={categoryOf(row)}
												onChange={(value) =>
													(rowCategory = { ...rowCategory, [row.id]: value })}
												inDataTable
											/>
										</div>
									</div>
								{:else if column.key === 'account'}
									<div
										class={cn(CELL, edgeClass(column), 'p-0')}
										style={cellStyle('account')}
										role="cell"
									>
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div
											class="h-full w-full"
											onclick={(event) => event.stopPropagation()}
										>
											<SelectAccount
												accounts={accountItems}
												value={walletOf(row)}
												onChange={(value) => (rowWallet = { ...rowWallet, [row.id]: value })}
												inDataTable
											/>
										</div>
									</div>
								{:else if column.key === 'amount'}
									<div
										class={cn(CELL, edgeClass(column), 'justify-end px-4')}
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
									<div
										class={cn(CELL, stickyClass(column), edgeClass(column), 'justify-center px-4')}
										style={cellStyle('actions')}
										role="cell"
									>
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<div class="flex h-full w-full items-center" onclick={(event) => event.stopPropagation()}>
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
											<dd>{nameOf(wallets, walletOf(row))}</dd>
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
