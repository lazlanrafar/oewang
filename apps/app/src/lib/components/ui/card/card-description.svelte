<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// The old file hard-coded #606060 here. `text-subtle` is the same grey as
	// a token, so dark mode can move it.
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card-description"
	class={cn('text-subtle text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</div>
