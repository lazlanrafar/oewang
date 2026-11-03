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
	import { DataTableFilter } from '../../molecules/data-table-filter/index.js';
	import { emptyFilterState, type DataTableFilterState } from '../../molecules/data-table-filter/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import DataTableEmptyState from './data-table-empty-state.svelte';
	import {
		GROUP_ROW_HEIGHT,
		GROUP_STICK_TOP,
		ROW_HEIGHT,
		TRANSACTION_COLUMNS,
		type ColumnKey,
		type ColumnSpec
	} from './columns.js';
	import { groupKey, groupLabel, GROUPINGS, type Grouping } from './grouping.js';
	import type { NamedOption, SortKey, TableSort, TransactionRow } from './types.js';
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
		class: className
	}: {
		rows: TransactionRow[];
		categories: NamedOption[];
		wallets: NamedOption[];
		filters?: DataTableFilterState;
		grouping?: Grouping;
		hidden?: Partial<Record<ColumnKey, boolean>>;
		sort?: TableSort;
		onSortChange?: (next: TableSort) => void;
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
		class?: string;
	} = $props();


	/**
	 * No sort of its own until a header is clicked: the rows arrive in the
	 * order the server chose, and that order is what a third click returns
	 * to. The live table cycles a header ascending, descending, off.
	 */
	/**
	 * Uncontrolled unless the page says otherwise.
	 *
	 * The specimen in the design system has no URL to write to, so it keeps
	 * its own sort here. A real page passes `sort` and `onSortChange` and the
	 * server does the sorting, because sorting only the page you happen to
	 * have loaded is not sorting (D55).
	 */
	let localSort = $state<TableSort>({
		key: null,
		descending: false
	});

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
	 * A width lives here rather than in the column spec so a drag can move it
	 * and a double click can put it back; a real page would also keep it per
	 * user, as the old app does in its table settings.
	 */
	let widths = $state<Partial<Record<ColumnKey, number>>>({});
	let resizing = $state<ColumnKey | null>(null);
	let sentinel = $state<HTMLElement | null>(null);

	/**
	 * Ask for the next page when the foot of the list comes into view.
	 *
	 * The margin is 600px, about thirteen rows of warning, so the next page
	 * is usually there before the reader reaches the end. A pixel margin has
	 * no unit to get wrong, unlike a row count: the live app counts day
	 * groups where it means rows and so fetches hundreds of rows early.
	 *
	 * The guards matter more than the observer. A list shorter than its own
	 * viewport leaves the sentinel permanently visible, so without
	 * `hasMore && !loadingMore` every completed load would immediately ask
	 * for another.
	 */
	$effect(() => {
		const target = sentinel;
		const root = scroller;
		if (!target || !root || !onLoadMore) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				if (!hasMore || loadingMore) return;
				onLoadMore();
			},
			{ root, rootMargin: '0px 0px 600px 0px', threshold: 0 }
		);

		observer.observe(target);
		return () => observer.disconnect();
	});

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

	const visibleColumns = $derived(TRANSACTION_COLUMNS.filter((column) => !hidden[column.key]));
	const hideableColumns = TRANSACTION_COLUMNS.filter((column) => !column.fixed);
	/**
	 * The last ordinary column takes whatever the others leave, which is how
	 * the live table is always as wide as what holds it. The actions column
	 * is stuck to the right edge and keeps its width, so it is not the one.
	 */
	const fillKey = $derived(visibleColumns.filter((column) => !column.stickyRight).at(-1)?.key);

	/**
	 * What the table needs before it has to scroll sideways: every fixed
	 * column at its width, and the filling one at its floor.
	 */
	const totalWidth = $derived(
		visibleColumns.reduce(
			(sum, column) => sum + (column.key === fillKey ? column.minWidth : widthOf(column)),
			0
		)
	);
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
	 * Built by walking the sorted list rather than by collecting the keys
	 * and filtering per key: that was quadratic, and with three months of
	 * rows accumulating as the list scrolls it is the sort of thing that is
	 * fine until it is not.
	 */
	const groups = $derived.by(() => {
		if (grouping === 'none') return [{ day: '', rows: sorted }];

		const blocks: { day: string; rows: TransactionRow[] }[] = [];
		for (const row of sorted) {
			const key = groupKey(row.day, grouping);
			const last = blocks.at(-1);
			if (last && last.day === key) last.rows.push(row);
			else blocks.push({ day: key, rows: [row] });
		}
		return blocks;
	});

	const selectedIds = $derived(sorted.filter((r) => selected[r.id]).map((r) => r.id));

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

	const accountItems = $derived(wallets.map((w) => ({ id: w.id, label: w.name })));
	const categoryItems = $derived(
		categories.map((c) => ({ id: c.id, label: c.name, colorClass: c.colorClass }))
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
		selected = checked ? Object.fromEntries(sorted.map((r) => [r.id, true])) : {};
	}

	/** A row opens its detail. There is no inline expansion. */
	function openRow(id: string) {
		const row = sorted.find((candidate) => candidate.id === id);
		if (row) onOpenRow?.(row);
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
		// The filling column states no width at all: a basis of zero and the
		// freedom to grow is what makes it take the remainder rather than a
		// share of it.
		if (column.key === fillKey) return `flex: 1 1 0%; min-width: ${column.minWidth}px;`;
		const width = widthOf(column);
		// The floor and the ceiling are the column's own, not today's width:
		// they are what the drag is allowed to do, and the live table carries
		// them on the cell for the same reason.
		const size = `width: ${width}px; min-width: ${column.minWidth}px; max-width: ${column.maxWidth}px; flex-shrink: 0;`;
		if (column.stickyLeft) return `${size} left: ${stickyOffsets[key] ?? 0}px;`;
		return size;
	}

	function stickyClass(column: ColumnSpec): string {
		if (column.stickyLeft) return 'sticky z-20';
		if (column.stickyRight) return 'sticky right-0 z-20 border-r-0 border-l border-border';
		return '';
	}

	/**
	 * The rule belongs between columns, not on the table's outer edge, and not
	 * twice at the seam: the sticky actions column draws its own left border,
	 * so the column before it drops its right one.
	 */
	const lastColumnKey = $derived(visibleColumns.at(-1)?.key);
	const beforeStickyRightKey = $derived(
		visibleColumns.at(-1)?.stickyRight ? visibleColumns.at(-2)?.key : undefined
	);
	const edgeClass = (column: ColumnSpec) =>
		column.key === lastColumnKey || column.key === beforeStickyRightKey ? 'border-r-0' : '';

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
			const dragged = startWidth + (move.clientX - startX);
			const next = Math.min(column.maxWidth, Math.max(column.minWidth, dragged));
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
				[column.key]: Math.min(
					column.maxWidth,
					Math.max(column.minWidth, widthOf(column) + direction * step)
				)
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
	/** The specimen's labels. A real page reads these from the dictionary. */
	const GROUPING_LABELS: Record<Grouping, string> = {
		none: 'None',
		daily: 'Daily',
		weekly: 'Weekly',
		monthly: 'Monthly'
	};

	const CELL =
		'h-full flex items-center border-r border-b border-border overflow-hidden bg-background transition-colors group-hover:bg-row-hover';
	// The header's colour and weight come from the old Table head atom, which
	// this layout replaces: #666666 at 500, measured on the live app.
	const HEAD =
		'text-subtle relative flex h-full items-center border-t border-r border-b border-border bg-background px-4 font-medium';
</script>

<svelte:window onresize={readScroll} />

<div class={cn('flex h-full min-h-0 flex-col gap-3', className)}>
	<!-- ------------------------------------------------------- toolbar -->
	{#if toolbar}
		<div class="flex flex-wrap items-start gap-2">
		<DataTableFilter bind:filters {facets} class="flex-1" />

		<div class="flex items-center gap-2">
			<Select.Root type="single" bind:value={grouping}>
				<Select.Trigger class="w-36">{GROUPING_LABELS[grouping]}</Select.Trigger>
				<Select.Content>
					{#each GROUPINGS as option (option)}
						<Select.Item value={option}>{GROUPING_LABELS[option]}</Select.Item>
					{/each}
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
	<!-- The outer rule on the left and right edges. The cells draw the grid
	     between columns and the rows draw it between rows, but the table's own
	     two sides are the scroller's, so they survive a column being hidden or
	     the body being scrolled sideways. -->
	<div
		class="border-border min-h-0 w-full flex-1 overflow-auto border-x"
		bind:this={scroller}
		onscroll={readScroll}
	>
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
			class="w-full"
			style="min-width: {totalWidth}px"
		>
			<!-- Header: its own block, as the old table keeps it, so the body
			     can scroll under it without the columns drifting. -->
			<div role="rowgroup" class="bg-background sticky top-0 z-40 block w-full border-0">
				<div class="flex h-[45px] w-full min-w-full items-center" role="row">
					{#each visibleColumns as column (column.key)}
						<div
							id={column.key === 'date' ? 'spec-head' : undefined}
							class={cn(
								HEAD,
								stickyClass(column),
								edgeClass(column),
								column.key === 'select' && 'px-0',
								column.key === 'actions' && 'justify-center px-0',
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

							<!-- No handle on the column that fills: its width is the
							     remainder, so a drag would move nothing. -->
							{#if column.resizable && column.key !== fillKey}
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

			{#if sorted.length === 0}
				<div role="rowgroup">
				<!--
					A row, because a rowgroup may only hold rows: an empty
					state parked loose inside one leaves the table's ARIA
					contract broken, which axe fails on and a screen reader
					reads as a table with nothing in it at all (UI-6). Same
					shape a native table uses for this, a single cell
					spanning the width.
				-->
				<div role="row" class="border-border border-b">
					<!-- Two empty states, not one: "none yet" and "none matching"
					     need different words and different next steps (UI-2). -->
					<div role="cell">
					<DataTableEmptyState
						title={emptyTitle}
						description={emptyDescription}
						actionLabel={canEdit ? emptyActionLabel : undefined}
						onAction={onAdd}
					/>
					</div>
				</div>
				</div>
			{/if}

			<!--
				One rowgroup per day, not one for the whole body.

				That is what scopes the sticky header below: a sticky box is
				held inside its containing block, so a day's header can only
				travel as far as the bottom of its own day and is then pushed
				out by the next one. With a single rowgroup around everything,
				the first day's header would pin for the whole table. No
				JavaScript and no scroll listener are involved, which is why
				`display: block` is explicit: `display: contents` would
				generate no box and there would be nothing to be held inside.
			-->
			{#each groups as group, groupIndex (group.day)}
				<div role="rowgroup" class="block w-full">
				{#if group.day}
					<!--
						The day group row: the one row that spans every column, and
						the only one that stays put while its day is on screen.

						`z-30` puts it under the column header's `z-40` and over the
						sticky cells' `z-20`. It carries a `row` and a `cell` role
						because a rowgroup may hold nothing else, and a bare div
						here breaks the same contract the comment above protects.
					-->
					<div
						id={groupIndex === 0 ? 'spec-group-row' : undefined}
						role="row"
						class="border-border bg-row-group sticky z-30 flex w-full min-w-full items-center gap-2 border-b px-4"
						style="top: {GROUP_STICK_TOP}px; height: {GROUP_ROW_HEIGHT}px"
					>
						<div role="cell" class="flex h-full w-full items-center gap-2">
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
							It is not a widget: the row actions menu carries the named,
							keyboard-reachable way in, so the row itself stays out of the
							tab order and announces nothing extra.
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
							onclick={() => openRow(row.id)}
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
													{
														rowCategory = { ...rowCategory, [row.id]: value };
														onCategoryChange?.(row, value);
													}}
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
												onChange={(value) => {
													rowWallet = { ...rowWallet, [row.id]: value };
													onWalletChange?.(row, value);
												}}
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
										<div class="w-full overflow-hidden text-right">
											<!-- The wallet-currency figure is the primary one: it is
											     what moved the wallet. The whole figure is coloured,
											     and the sign is there too, so colour is never the
											     only carrier (UI-7). -->
											<div
												class={cn(
													'truncate font-mono',
													isNegative(row.amount) ? 'text-red' : 'text-green'
												)}
											>
												{money(row)}
											</div>
											{#if row.originalAmount && row.originalCurrency}
												<!-- What the user typed, muted beside it (TXN-21). A
												     row entered in the wallet's own currency shows
												     one line. -->
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
									</div>
								{:else}
									<div
										class={cn(CELL, stickyClass(column), edgeClass(column), 'justify-center px-0')}
										style={cellStyle('actions')}
										role="cell"
									>
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
												<DropdownMenu.Item onclick={() => openRow(row.id)}>Open</DropdownMenu.Item>
												<DropdownMenu.Item onclick={() => onEditRow?.(row)}>Edit</DropdownMenu.Item>
												<DropdownMenu.Separator />
												<DropdownMenu.Item
													class="text-destructive"
													onclick={() => onDeleteRow?.(row)}
												>
													Delete
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
										</div>
									</div>
								{/if}
							{/each}
						</div>

					{/each}
				{/if}
				</div>
			{/each}

			{#if hasMore || loadingMore}
				<!--
					The foot of the list, as a row: a rowgroup may hold nothing
					else, and a loose div here is the same ARIA break the empty
					state above was written to avoid.

					`aria-live="polite"` because the list grows without anyone
					asking, and a reader who cannot see it arriving should be
					told once rather than on every row.
				-->
				<div role="rowgroup" class="block w-full">
					<div
						role="row"
						class="border-border flex w-full min-w-full items-center justify-center border-b"
						style="height: {ROW_HEIGHT}px"
					>
						<div role="cell" class="text-subtle text-small flex items-center gap-2" aria-live="polite">
							{#if loadingMore}
								<Spinner size={14} />
								Loading more
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!--
				The trigger. A pixel tall and after everything, so it is only
				reached at the end of what is loaded, and watched rather than
				polled: an observer fires once per crossing and costs nothing
				in between, where a scroll handler runs on every frame of every
				scroll.
			-->
			<div bind:this={sentinel} role="presentation" aria-hidden="true" class="h-px w-full"></div>
		</div>
	</div>

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
