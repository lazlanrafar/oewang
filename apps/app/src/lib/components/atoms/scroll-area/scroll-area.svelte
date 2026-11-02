<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/utils.js';

	// Ported from the old app's atoms/scroll-area.tsx, with a square thumb.
	let {
		ref = $bindable(null),
		class: className,
		orientation = 'vertical',
		children,
		...restProps
	}: WithoutChild<ScrollAreaPrimitive.RootProps> & {
		orientation?: 'vertical' | 'horizontal' | 'both';
	} = $props();
</script>

<ScrollAreaPrimitive.Root
	bind:ref
	data-slot="scroll-area"
	class={cn('relative overflow-hidden', className)}
	{...restProps}
>
	<ScrollAreaPrimitive.Viewport class="size-full">
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>
	{#if orientation !== 'horizontal'}
		<ScrollAreaPrimitive.Scrollbar
			orientation="vertical"
			class="flex h-full w-2.5 touch-none border-l border-l-transparent p-px transition-colors select-none"
		>
			<ScrollAreaPrimitive.Thumb class="bg-border relative flex-1" />
		</ScrollAreaPrimitive.Scrollbar>
	{/if}
	{#if orientation !== 'vertical'}
		<ScrollAreaPrimitive.Scrollbar
			orientation="horizontal"
			class="flex h-2.5 touch-none flex-col border-t border-t-transparent p-px transition-colors select-none"
		>
			<ScrollAreaPrimitive.Thumb class="bg-border relative flex-1" />
		</ScrollAreaPrimitive.Scrollbar>
	{/if}
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
