<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLOListElement>> = $props();
</script>

<ol
	bind:this={ref}
	data-slot="breadcrumb-list"
	class={cn(
		'text-subtle text-body flex flex-wrap items-center gap-1.5 wrap-break-word sm:gap-2.5',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</ol>
