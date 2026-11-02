<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	/*
	 * Ported from the old app's molecules/button-group.tsx: buttons joined
	 * into one control, sharing their borders.
	 */
	let {
		ref = $bindable(null),
		class: className,
		orientation = 'horizontal',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		orientation?: 'horizontal' | 'vertical';
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="button-group"
	data-orientation={orientation}
	role="group"
	class={cn(
		'flex w-fit items-stretch',
		orientation === 'horizontal'
			? '[&>*:not(:first-child)]:-ml-px'
			: 'flex-col [&>*:not(:first-child)]:-mt-px',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
