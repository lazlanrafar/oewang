<script lang="ts">
	/**
	 * One sortable header, drawn as the transactions table draws its own:
	 * a ghost button with the label and an arrow on the sorted column. Shared
	 * by the two Database tables, so a third table does not copy it again.
	 */
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';

	import { Button } from '$lib/components/atoms/button';
	import type { TableSort } from '$lib/components/molecules/data-table';

	let {
		key,
		label,
		sortable = false,
		sort,
		onSortChange
	}: {
		key: string;
		/** Already translated (UI-1). */
		label: string;
		sortable?: boolean;
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
	} = $props();

	/** Ascending, then descending, then off: the third click clears it. */
	function toggle() {
		onSortChange(
			sort.key !== key
				? { key, descending: false }
				: sort.descending
					? { key: null, descending: false }
					: { key, descending: true }
		);
	}
</script>

{#if sortable}
	<Button variant="ghost" class="max-w-full min-w-0 p-0 hover:bg-transparent" onclick={toggle}>
		<span class="truncate">{label}</span>
		{#if sort.key === key && !sort.descending}
			<ArrowDown class="size-4" />
		{:else if sort.key === key}
			<ArrowUp class="size-4" />
		{/if}
	</Button>
{:else}
	<span class="truncate">{label}</span>
{/if}
