<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// A grid so an action can sit in the second column, as the old header did.
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-header"
	class={cn(
		'grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 p-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
