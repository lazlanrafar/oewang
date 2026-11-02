<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="button-group-text"
	class={cn(
		'bg-muted text-body flex items-center gap-2 border px-4 font-medium [&_svg]:pointer-events-none [&_svg:not([class*=size-])]:size-4',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
