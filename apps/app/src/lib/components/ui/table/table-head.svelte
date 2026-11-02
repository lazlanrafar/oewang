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

<th
	bind:this={ref}
	data-slot="table-head"
	class={cn('h-12 px-4 text-left align-middle text-subtle font-medium [&:has([role=checkbox])]:pr-0 border-r last:border-r-0 nth-last-2:border-r-0 w-auto', className)}
	{...restProps}
>
	{@render children?.()}
</th>
