<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	// Ported from the old app's atoms/accordion.tsx: items are separated by a
	// rule, with no border around the set.
	let { ref = $bindable(null), class: className, ...restProps }: AccordionPrimitive.ItemProps =
		$props();
</script>

<AccordionPrimitive.Item
	bind:ref
	data-slot="accordion-item"
	class={cn('border-border border-b', className)}
	{...restProps}
/>
