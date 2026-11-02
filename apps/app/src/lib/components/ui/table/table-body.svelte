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

<tbody
	bind:this={ref}
	data-slot="table-body"
	class={cn('[&_tr:last-child]:border-0 border', className)}
	{...restProps}
>
	{@render children?.()}
</tbody>
