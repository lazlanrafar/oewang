<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	/*
	 * Ported from the old app's atoms/radio-group.tsx. A 15px square with a
	 * filled centre, rather than the old circle (D52): the checked mark is a
	 * block, not a dot, so the shape still reads at this size.
	 */
	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChildrenOrChild<RadioGroupPrimitive.ItemProps> = $props();
</script>

<RadioGroupPrimitive.Item
	bind:ref
	data-slot="radio-group-item"
	class={cn(
		'border-primary text-primary aspect-square size-4 border outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span class="flex items-center justify-center">
			{#if checked}
				<span class="bg-primary block size-2"></span>
			{/if}
		</span>
	{/snippet}
</RadioGroupPrimitive.Item>
