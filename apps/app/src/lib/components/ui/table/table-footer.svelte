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

<tfoot
	bind:this={ref}
	data-slot="table-footer"
	class={cn('bg-primary font-medium text-primary-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</tfoot>
