<script lang="ts">
	import { Separator } from '../../atoms/separator/index.js';
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
	data-slot="field-separator"
	class={cn('relative -my-2 h-5 text-sm', className)}
	{...restProps}
>
	<Separator class="absolute inset-0 top-1/2" />
	{#if children}
		<span class="bg-background text-subtle relative mx-auto block w-fit px-2">
			{@render children()}
		</span>
	{/if}
</div>
