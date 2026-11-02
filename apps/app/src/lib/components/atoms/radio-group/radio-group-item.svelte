<script lang="ts">
	import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	/*
	 * Ported from the old app's atoms/radio-group.tsx: a 15px circle with a
	 * filled dot.
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
		'border-primary text-primary aspect-square size-4 rounded-full border focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
>
	{#snippet children({ checked })}
		<span class="flex items-center justify-center">
			{#if checked}
				<span class="bg-primary block size-2 rounded-full"></span>
			{/if}
		</span>
	{/snippet}
</RadioGroupPrimitive.Item>
