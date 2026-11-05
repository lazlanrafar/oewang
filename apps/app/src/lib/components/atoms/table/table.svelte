<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// Ported from the old app's atoms/table.tsx.
	//
	// `compact` is for a short table read beside something else, such as a
	// chat canvas: tighter rows and side padding. The cells read it from
	// here, so a caller never pads a cell itself (D81).
	let {
		ref = $bindable(null),
		density = 'default',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		density?: 'default' | 'compact';
	} = $props();
</script>

<table
	bind:this={ref}
	data-slot="table"
	data-density={density}
	class={cn('group/table w-full caption-bottom text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</table>
