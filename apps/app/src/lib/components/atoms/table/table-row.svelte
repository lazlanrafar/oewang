<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// The horizontal rule is on the cell, not here: that is where the live
	// app puts it, and it lets the last row drop its rule on its own.
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn('', className)}
	{...restProps}
>
	{@render children?.()}
</tr>
