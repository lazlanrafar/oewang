<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { toggleVariants } from '../toggle/toggle.svelte';
	import { getToggleGroupContext } from './context.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.ItemProps = $props();

	// Variant and size come from the group, so an item cannot drift from its
	// neighbours. The shared border is collapsed with a negative margin.
	const group = getToggleGroupContext();
</script>

<ToggleGroupPrimitive.Item
	bind:ref
	data-slot="toggle-group-item"
	class={cn(
		toggleVariants({ variant: group.variant, size: group.size }),
		'shrink-0 focus:z-10 data-[variant=outline]:-ml-px',
		className
	)}
	data-variant={group.variant}
	{...restProps}
/>
