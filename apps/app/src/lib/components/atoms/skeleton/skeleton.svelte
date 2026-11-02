<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/*
	 * Ported from the old app's atoms/skeleton.tsx: a muted block with a
	 * gradient swept across it by the `shimmer` keyframes in app.css, rather
	 * than the usual pulse.
	 */
	let {
		ref = $bindable(null),
		class: className,
		animate = true,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { animate?: boolean } = $props();
</script>

<div
	bind:this={ref}
	data-slot="skeleton"
	class={cn(
		'bg-muted relative overflow-hidden bg-linear-to-r from-transparent via-black/10 to-transparent bg-size-[200%_100%] dark:via-white/10',
		animate && 'animate-shimmer',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
