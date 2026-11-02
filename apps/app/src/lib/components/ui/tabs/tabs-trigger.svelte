<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.TriggerProps =
		$props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		'text-subtle data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px h-9 shrink-0 border-b border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
		className
	)}
	{...restProps}
/>
