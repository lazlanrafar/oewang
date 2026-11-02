<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// Ported from the old app's atoms/kbd.tsx. The old one is `rounded-sm`;
	// nothing here is rounded (D52).
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd
	bind:this={ref}
	data-slot="kbd"
	class={cn(
		'bg-muted text-subtle text-small pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 px-1 font-sans font-medium select-none',
		"[&_svg:not([class*='size-'])]:size-3",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</kbd>
