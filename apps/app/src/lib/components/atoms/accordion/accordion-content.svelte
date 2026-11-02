<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';
	import { cn, type WithoutChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithoutChild<AccordionPrimitive.ContentProps> = $props();
</script>

<AccordionPrimitive.Content
	bind:ref
	data-slot="accordion-content"
	class="text-body overflow-hidden transition-all"
	{...restProps}
>
	<div class={cn('pb-4', className)}>
		{@render children?.()}
	</div>
</AccordionPrimitive.Content>
