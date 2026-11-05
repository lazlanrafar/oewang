<script lang="ts" generics="Row extends { id: string }">
	/**
	 * The table shell: the scrollport, the sticky header, the rows, and the
	 * behaviour every table in this app has in common.
	 *
	 * What it owns is the part that is the same whatever is in a row: the
	 * geometry, the ARIA, column resizing, the sideways scroll arrows, group
	 * rows with their sticky headers, and asking for the next page when the
	 * foot comes into view. What a column means and what a cell renders are
	 * the caller's, through snippets, because those are the only two things
	 * that actually differ between one table and the next.
	 *
	 * It holds no data and fetches nothing. Rows arrive as a prop.
	 *
	 * The roles have to sit inside a table to mean anything: a `row` with no
	 * `table` ancestor is dropped, and a screen reader is handed a pile of
	 * divs with no column names and no counts (UI-6).
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { Snippet } from 'svelte';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { cn } from '$lib/utils.js';

	import type { ColumnSpec } from './data-table-column.js';
	import type { RowGroup } from './data-table-types.js';
	import { GROUP_ROW_HEIGHT, GROUP_STICK_TOP, ROW_HEIGHT } from './data-table-column.js';
	import { CELL, HEAD, tableLayout } from './data-table-layout.svelte.js';

	let {
		columns,
		rows,
		groups,
		label,
		/** The whole list, when the rows on screen are only part of it. */
		total,
		rowHeight = ROW_HEIGHT,
		widths = $bindable({}),
		collapsed = $bindable({}),
		onRowClick,
		rowClass,
		columnArrows = false,
		hasMore = false,
		loadingMore = false,
		loadingMoreLabel,
		onLoadMore,
		resizeLabel = (column) => `Resize ${column.label}`,
		scrollLeftLabel = 'Scroll columns left',
		scrollRightLabel = 'Scroll columns right',
		head,
		cell,
		groupRow,
		empty,
		footer,
		class: className
	}: {
		columns: ColumnSpec[];
		/** Every row, in order. Ignored when `groups` is given. */
		rows: Row[];
		/** Rows in blocks, each with its own heading row. */
		groups?: RowGroup<Row>[];
		label: string;
		total?: number;
		rowHeight?: number;
		/**
		 * A column's current width, when a drag has changed it. Bindable, so
		 * the caller can keep it per user; the shell writes it as the handle
		 * moves and deletes the entry when a double click resets the column.
		 */
		widths?: Record<string, number | undefined>;
		/** Which groups are shut, by group key. */
		collapsed?: Record<string, boolean>;
		onRowClick?: (row: Row) => void;
		/** Extra classes for one row, such as the tint a selected row takes. */
		rowClass?: (row: Row) => string | undefined;
		/**
		 * The sideways arrows, offered to `head` as a snippet. They belong at
		 * the seam where the scrolling columns start, which is a position only
		 * the header's own content knows, so the caller renders them.
		 */
		columnArrows?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		loadingMoreLabel?: string;
		/** Called when the foot of the list comes into view. */
		onLoadMore?: () => void;
		resizeLabel?: (column: ColumnSpec) => string;
		scrollLeftLabel?: string;
		scrollRightLabel?: string;
		/**
		 * One header's contents. The cell around it is this component's, and
		 * `arrows` is rendered only on the column where the scrolling ones
		 * start, so a caller that ignores it loses nothing.
		 */
		head: Snippet<[ColumnSpec, Snippet | undefined]>;
		/** One cell's contents, for a column and a row. */
		cell: Snippet<[ColumnSpec, Row]>;
		/** A group's heading row: the label and whatever it totals. */
		groupRow?: Snippet<[{ key: string; rows: Row[]; collapsed: boolean; toggle: () => void }]>;
		empty?: Snippet;
		/** Anything after the last row, such as a page count. */
		footer?: Snippet;
		class?: string;
	} = $props();

	const layout = $derived(tableLayout(columns, widths));

	/** One block when the caller does not group: the same code path either way. */
	const blocks = $derived<RowGroup<Row>[]>(groups ?? [{ key: '', rows }]);
	const rowCount = $derived(blocks.reduce((sum, block) => sum + block.rows.length, 0));

	const widthOf = (column: ColumnSpec) => widths[column.key] ?? column.width;

	// ------------------------------------------------------- resizing

	let resizing = $state<string | null>(null);

	/** No handle on the column that fills: its width is the remainder. */
	const fillKey = $derived(columns.filter((column) => !column.stickyRight).at(-1)?.key);

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

		const move = (moved: PointerEvent) => {
			const dragged = startWidth + (moved.clientX - startX);
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
	 * Home puts it back. Dragging was once the only way to resize a column,
	 * and a pointer-only control is no control for half the users.
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

	// -------------------------------------------- sideways scrolling

	/*
	 * The arrows step by a column rather than by a fixed distance, so a press
	 * always lands on a column boundary instead of halfway through one.
	 */
	let scroller = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	let isScrollable = $state(false);

	$effect(() => {
		// Re-read when the columns change: hiding one can stop the table
		// being scrollable at all.
		layout.totalWidth;
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
		for (const column of columns) {
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

	/** The arrows live on the last column that stays put while the rest move. */
	const lastStickyKey = $derived(columns.filter((column) => column.stickyLeft).at(-1)?.key);

	// ------------------------------------------------- the next page

	let sentinel = $state<HTMLElement | null>(null);

	/**
	 * Ask for the next page when the foot of the list comes into view.
	 *
	 * The margin is 600px, about thirteen rows of warning, so the next page
	 * is usually there before the reader reaches the end.
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

	function toggleGroup(key: string) {
		collapsed = { ...collapsed, [key]: !collapsed[key] };
	}
</script>

<svelte:window onresize={readScroll} />

{#snippet arrows()}
	<div class="hidden shrink-0 items-center space-x-2 md:flex">
		<Button
			variant="outline"
			size="sm"
			class="size-6 p-0"
			disabled={!canScrollLeft}
			aria-label={scrollLeftLabel}
			onclick={() => scrollByColumn(-1)}
		>
			<ArrowLeft class={cn('size-3.5', canScrollLeft && 'text-primary')} />
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="size-6 p-0"
			disabled={!canScrollRight}
			aria-label={scrollRightLabel}
			onclick={() => scrollByColumn(1)}
		>
			<ArrowRight class={cn('size-3.5', canScrollRight && 'text-primary')} />
		</Button>
	</div>
{/snippet}

<div class={cn('flex h-full min-h-0 flex-col', className)}>
	<!-- The outer rule on the left, right and bottom edges, as the old app's
	     scroller draws it (`border-l border-r border-b`). The cells draw the
	     grid between columns and the rows draw it between rows, but the
	     table's own sides are the scroller's, so they survive a column being
	     hidden or the body being scrolled sideways. The table fills its box,
	     so the bottom rule closes the box, below any space under the last
	     row.

	     The scrollbar is hidden, as the old app hid it: the header arrows
	     move it sideways, and a bar along a ruled box reads as a column. -->
	<div
		bind:this={scroller}
		onscroll={readScroll}
		class="border-border scrollbar-hide min-h-0 w-full flex-1 overflow-auto border-x border-b"
	>
		<div
			role="table"
			aria-label={label}
			aria-rowcount={total ?? rowCount}
			aria-colcount={columns.length}
			class="w-full"
			style="min-width: {layout.totalWidth}px"
		>
			<!-- The header is its own block so the body scrolls under it
			     without the columns drifting. -->
			<div role="rowgroup" class="bg-background sticky top-0 z-40 block w-full border-0">
				<div class="flex h-[45px] w-full min-w-full items-center" role="row">
					{#each columns as column (column.key)}
						<div
							class={cn(
								HEAD,
								layout.stickyClass(column),
								layout.edgeClass(column.key),
								column.alignRight && 'justify-end',
								column.headClass
							)}
							style={layout.cellStyle(column.key)}
							role="columnheader"
						>
							{@render head(
								column,
								columnArrows && column.key === lastStickyKey && isScrollable
									? arrows
									: undefined
							)}

							<!-- No handle on the column that fills: its width is the
							     remainder, so a drag would move nothing. -->
							{#if column.resizable && column.key !== fillKey}
								<!--
									4px wide, on the column's right edge and half outside
									it. A button rather than a bare div, so the arrow keys
									reach it.
								-->
								<button
									type="button"
									class={cn(
										'absolute top-0 right-0 h-full w-1 translate-x-1/2 cursor-col-resize touch-none select-none',
										resizing === column.key ? 'bg-primary' : 'bg-transparent hover:bg-border'
									)}
									aria-label={resizeLabel(column)}
									onpointerdown={(event) => startResize(event, column)}
									ondblclick={() => resetWidth(column)}
									onkeydown={(event) => nudgeWidth(event, column)}
								></button>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			{#if rowCount === 0 && empty}
				<div role="rowgroup" class="block w-full">
					<!-- A row, because a rowgroup may hold nothing else: an empty
					     state parked loose inside one breaks the table's ARIA
					     contract, which axe fails on. -->
					<div role="row" class="border-border border-b">
						<div role="cell">{@render empty()}</div>
					</div>
				</div>
			{/if}

			<!--
				One rowgroup per block, not one for the whole body.

				That is what scopes a group's sticky heading: a sticky box is
				held inside its containing block, so a day's header can only
				travel as far as the bottom of its own day and is then pushed
				out by the next one. With a single rowgroup around everything,
				the first heading would pin for the whole table. `display:
				block` is explicit because `display: contents` would generate
				no box, and there would be nothing to be held inside.
			-->
			{#each blocks as block (block.key)}
				<div role="rowgroup" class="block w-full">
					{#if block.key && groupRow}
						<!--
							`z-30` puts the heading under the column header's `z-40`
							and over the sticky cells' `z-20`. It carries a `row` and a
							`cell` role because a rowgroup may hold nothing else.
						-->
						<div
							data-group-row
							role="row"
							class="border-border bg-row-group sticky z-30 flex w-full min-w-full items-center gap-2 border-b px-4"
							style="top: {GROUP_STICK_TOP}px; height: {GROUP_ROW_HEIGHT}px"
						>
							<div role="cell" class="flex h-full w-full items-center gap-2">
								{@render groupRow({
									key: block.key,
									rows: block.rows,
									collapsed: collapsed[block.key] === true,
									toggle: () => toggleGroup(block.key)
								})}
							</div>
						</div>
					{/if}

					{#if !collapsed[block.key]}
						{#each block.rows as row (row.id)}
							<!-- The row answers a click as a pointer convenience. It is
							     not a widget: a named, keyboard-reachable way in belongs
							     in a cell, so the row stays out of the tab order. -->
							<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_interactive_supports_focus -->
							<div
								role="row"
								class={cn(
									'group flex w-full min-w-full items-center border-0 select-text',
									onRowClick && 'hover:bg-row-hover cursor-pointer',
									rowClass?.(row)
								)}
								style="height: {rowHeight}px"
								onclick={() => onRowClick?.(row)}
							>
								{#each columns as column (column.key)}
									<div
										class={cn(
											CELL,
											layout.stickyClass(column),
											layout.edgeClass(column.key),
											column.alignRight && 'justify-end',
											column.cellClass
										)}
										style={layout.cellStyle(column.key)}
										role="cell"
									>
										{@render cell(column, row)}
									</div>
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
						style="height: {rowHeight}px"
					>
						<div
							role="cell"
							class="text-subtle text-small flex items-center gap-2"
							aria-live="polite"
						>
							{#if loadingMore}
								<Spinner size={14} />
								{loadingMoreLabel}
							{/if}
						</div>
					</div>
				</div>
			{/if}

			{#if footer}{@render footer()}{/if}

			{#if onLoadMore}
				<!--
					The trigger. A pixel tall and after everything, so it is only
					reached at the end of what is loaded, and watched rather than
					polled: an observer fires once per crossing and costs nothing
					in between, where a scroll handler runs on every frame.
				-->
				<div bind:this={sentinel} role="presentation" aria-hidden="true" class="h-px w-full"></div>
			{/if}
		</div>
	</div>
</div>
