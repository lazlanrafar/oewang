<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLTdAttributes } from 'svelte/elements';

	// Ported from the old app's atoms/table.tsx.
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTdAttributes> = $props();
</script>

<td
	bind:this={ref}
	data-slot="table-cell"
	class={cn('h-12 px-4 py-2 align-middle overflow-hidden border-b [&:has([role=checkbox])]:pr-0 [&:has([data-slot=combobox-trigger])]:p-0 border-r last:border-r-0 group-data-[density=compact]/table:h-9 group-data-[density=compact]/table:px-3 group-data-[density=compact]/table:py-1.5 group-data-[density=compact]/table:[&_[data-slot=combobox-trigger]]:text-xs', className)}
	{...restProps}
>
	{@render children?.()}
</td>
