<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/*
	 * Ported from the old app's atoms/card.tsx.
	 *
	 * Square, a plain border, no shadow and `bg-background` rather than
	 * `bg-card`: the old card sits flat on the page and is read by its rule,
	 * not by elevation. Every step of the shadow scale is `none` (D52), so a
	 * shadow class here would be silent anyway.
	 */
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	class={cn('border bg-background text-card-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</div>
