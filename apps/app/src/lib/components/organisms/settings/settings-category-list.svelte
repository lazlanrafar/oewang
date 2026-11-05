<script lang="ts">
	/**
	 * One category type's rows, as the old app's `CategoryForm` renders them:
	 * a plain two-column table, each row with a drag handle before its name
	 * and a pencil and a trash at the end (D82).
	 *
	 * The old app sorted with dnd-kit. This is the same feel on pointer
	 * events, which cover mouse, pen and touch without a dependency: the
	 * grabbed row follows the pointer, the others slide out of its way as its
	 * centre crosses theirs (a FLIP animation, as dnd-kit's sortable strategy
	 * does), and on release it eases into the slot it was given. dnd-kit's
	 * keyboard sensor becomes the arrow keys on the focused handle, one row
	 * per press, announced through a live region.
	 *
	 * Rows are plain `<tr>` rather than `Table.Row`, because `animate:` only
	 * works on an element directly inside a keyed each. `Table.Row` adds no
	 * classes, so nothing about the look changes.
	 *
	 * It holds the order only while it is being changed. `onReorder` reports
	 * the finished order, the page posts it, and the reloaded rows replace
	 * this copy, so a failed save puts the old order back on its own.
	 */
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { tick } from 'svelte';
	import { flip } from 'svelte/animate';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { Button } from '$lib/components/atoms/button';
	import * as Table from '$lib/components/atoms/table';
	import { t } from '$lib/i18n';
	import type { Category } from '$lib/server/ledger';

	let {
		categories,
		label,
		canEdit = true,
		empty,
		onReorder,
		onEditRow,
		onDeleteRow
	}: {
		categories: Category[];
		/** The table's accessible name. */
		label: string;
		canEdit?: boolean;
		/** What the table says when the type has no rows. */
		empty: string;
		/** The whole order, top first, once a drag or a key press has moved a row. */
		onReorder?: (ids: string[]) => void;
		onEditRow?: (category: Category) => void;
		onDeleteRow?: (category: Category) => void;
	} = $props();

	/** How long a row takes to slide, matching dnd-kit's default. */
	const SLIDE_MS = 200;

	/*
	 * The rows as shown: the server's order, overridden locally while a row
	 * is being moved. A writable `$derived`, so it is right on the server's
	 * first render and snaps back to the server's order whenever a reload
	 * brings one, which is also how a failed save undoes itself.
	 */
	let rows = $derived<Category[]>([...categories]);
	let dragging = $state<string | null>(null);
	/** The grabbed row's offset from its slot, in pixels, while it moves. */
	let offset = $state(0);
	/** True while the released row eases back into its slot. */
	let settling = $state(false);
	let announcement = $state('');
	let body = $state<HTMLElement | null>(null);

	const ids = (list: Category[]) => list.map((row) => row.id);

	function move(from: number, to: number) {
		if (from === to || to < 0 || to >= rows.length) return false;
		const next = [...rows];
		const [row] = next.splice(from, 1);
		next.splice(to, 0, row);
		rows = next;
		return true;
	}

	function announce(row: Category) {
		announcement = t('settings.reorder_moved', {
			name: row.name,
			position: rows.indexOf(row) + 1,
			count: rows.length
		});
	}

	/**
	 * Drag by the handle. The move and release are heard on the window, not
	 * through pointer capture on the handle: a reorder moves the row's `<tr>`
	 * in the document, and moving an element drops any capture inside it, so
	 * a captured drag stops hearing the pointer after its first swap.
	 *
	 * Every row's height is measured once, when the drag starts, and each
	 * slot's top is then worked out from the order rather than read back
	 * from the page. Reading it back would mean waiting for the reorder to
	 * render, and a pointer-up that lands during that wait is how a row gets
	 * left hanging where the pointer was.
	 */
	function startDrag(event: PointerEvent, row: Category) {
		if (event.button !== 0 || settling) return;
		// No text selection while dragging. That also cancels the focus a
		// press would give, so it is given back: a press on the handle then
		// arrow keys is the keyboard path for a mouse user.
		event.preventDefault();
		(event.currentTarget as HTMLElement).focus();
		const pointerId = event.pointerId;

		const heights = new Map<string, number>();
		for (const tr of body?.querySelectorAll<HTMLElement>('tr[data-id]') ?? []) {
			heights.set(tr.dataset.id!, tr.offsetHeight);
		}
		const heightOf = (id: string) => heights.get(id) ?? 0;
		/** A slot's top, measured from the first row's. */
		const topOf = (index: number) =>
			rows.slice(0, index).reduce((sum, entry) => sum + heightOf(entry.id), 0);

		const before = ids(rows);
		const startY = event.clientY;
		const startTop = topOf(rows.indexOf(row));
		dragging = row.id;
		offset = 0;

		const onMove = (moved: PointerEvent) => {
			if (moved.pointerId !== pointerId) return;
			const top = startTop + (moved.clientY - startY);
			const centre = top + heightOf(row.id) / 2;

			// The slot whose band holds the grabbed row's centre.
			const others = rows.filter((entry) => entry.id !== row.id);
			let target = 0;
			let edge = 0;
			for (const entry of others) {
				edge += heightOf(entry.id);
				if (centre > edge - heightOf(entry.id) / 2) target += 1;
			}

			move(rows.indexOf(row), target);
			// Stay under the pointer rather than jumping with the slot.
			offset = top - topOf(rows.indexOf(row));
		};

		const onUp = (released: PointerEvent) => {
			if (released.pointerId !== pointerId) return;
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);

			// Ease into the slot, then hand the row back to the list.
			settling = true;
			offset = 0;
			setTimeout(() => {
				dragging = null;
				settling = false;
				const after = ids(rows);
				if (after.join() !== before.join()) {
					announce(row);
					onReorder?.(after);
				}
			}, SLIDE_MS);
		};

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	}

	async function onHandleKey(event: KeyboardEvent, row: Category) {
		const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
		if (step === 0) return;
		event.preventDefault();
		const from = rows.indexOf(row);
		if (!move(from, from + step)) return;
		announce(row);
		onReorder?.(ids(rows));

		// Moving a row can move its own `<tr>`, which drops the focus inside
		// it; the next press has to land on the same handle.
		await tick();
		body?.querySelector<HTMLElement>(`tr[data-id="${row.id}"] [data-handle]`)?.focus();
	}
</script>

<Table.Root aria-label={label}>
	<Table.Header>
		<Table.Row>
			<Table.Head class="text-xs">{t('common.name')}</Table.Head>
			{#if canEdit}
				<Table.Head class="w-[100px] text-right text-xs">{t('common.actions')}</Table.Head>
			{/if}
		</Table.Row>
	</Table.Header>
	<Table.Body bind:ref={body}>
		{#each rows as row (row.id)}
			<tr
				data-slot="table-row"
				data-id={row.id}
				animate:flip={{ duration: dragging === row.id ? 0 : SLIDE_MS }}
				class={dragging === row.id ? 'bg-row-hover relative z-10' : undefined}
				style:transform={dragging === row.id ? `translateY(${offset}px)` : undefined}
				style:transition={dragging === row.id && settling
					? `transform ${SLIDE_MS}ms ease`
					: undefined}
			>
				<Table.Cell class="font-medium">
					<span class="flex min-w-0 items-center gap-1">
						{#if canEdit}
							<Button
								variant="ghost"
								size="icon"
								class="size-7 shrink-0 cursor-grab touch-none active:cursor-grabbing"
								aria-label={t('settings.reorder_label', { name: row.name })}
								aria-describedby="category-reorder-hint"
								data-handle
								onpointerdown={(event: PointerEvent) => startDrag(event, row)}
								onkeydown={(event: KeyboardEvent) => onHandleKey(event, row)}
							>
								<GripVertical class="text-subtle size-4" />
							</Button>
						{/if}
						<span class="truncate">{row.name}</span>
					</span>
				</Table.Cell>
				{#if canEdit}
					<Table.Cell class="text-right">
						<span class="flex items-center justify-end gap-1">
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								aria-label={t('common.edit')}
								onclick={() => onEditRow?.(row)}
							>
								<Pencil class="size-4" />
							</Button>
							<Button
								variant="ghost-destructive"
								size="icon"
								class="size-7"
								aria-label={t('settings.delete_category')}
								onclick={() => onDeleteRow?.(row)}
							>
								<Trash2 class="size-4" />
							</Button>
						</span>
					</Table.Cell>
				{/if}
			</tr>
		{:else}
			<Table.Row>
				<Table.Cell colspan={canEdit ? 2 : 1} class="text-subtle h-32 text-center text-xs">
					{empty}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>

{#if canEdit}
	<p id="category-reorder-hint" class="sr-only">{t('settings.reorder_hint')}</p>
	<p class="sr-only" role="status" aria-live="polite">{announcement}</p>
{/if}
