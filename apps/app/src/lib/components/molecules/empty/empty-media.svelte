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
	data-slot="empty-media"
	class={cn(
		'bg-muted text-subtle mb-2 flex size-10 shrink-0 items-center justify-center [&_svg:not([class*=size-])]:size-6',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
