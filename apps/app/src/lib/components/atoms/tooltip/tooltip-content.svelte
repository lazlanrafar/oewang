<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	/*
	 * Ported from the old app's atoms/tooltip.tsx: a blurred panel rather than
	 * a solid one.
	 */
	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		...restProps
	}: TooltipPrimitive.ContentProps = $props();
</script>

<TooltipPrimitive.Portal>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		class={cn(
			'text-card-foreground text-body bg-card/95 z-50 overflow-hidden border px-3 py-1.5 shadow-md backdrop-blur-lg',
			'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0',
			className
		)}
		{...restProps}
	/>
</TooltipPrimitive.Portal>
