<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	// A rule under the whole row, which the active trigger overdraws. Square,
	// like every other surface in this design system.
	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.ListProps =
		$props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn('border-border flex w-full items-center gap-4 overflow-x-auto border-b', className)}
	{...restProps}
/>
