<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<h5
	bind:this={ref}
	data-slot="alert-title"
	class={cn('mb-1 leading-none font-medium tracking-tight', className)}
	{...restProps}
>
	{@render children?.()}
</h5>
