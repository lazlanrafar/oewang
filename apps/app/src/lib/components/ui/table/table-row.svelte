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

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn('border-b', className)}
	{...restProps}
>
	{@render children?.()}
</tr>
