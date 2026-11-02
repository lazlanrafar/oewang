<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// Ported from the old app's atoms/table.tsx.
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<td
	bind:this={ref}
	data-slot="table-cell"
	class={cn('px-4 py-2 align-middle overflow-hidden [&:has([role=checkbox])]:pr-0 border-r last:border-r-0 nth-last-2:border-r-0', className)}
	{...restProps}
>
	{@render children?.()}
</td>
