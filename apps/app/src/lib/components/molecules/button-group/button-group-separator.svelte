<script lang="ts">
	import { Separator } from '../../atoms/separator/index.js';
	import { cn } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';

	let {
		class: className,
		orientation = 'vertical',
		...restProps
	}: ComponentProps<typeof Separator> = $props();
</script>

<Separator
	data-slot="button-group-separator"
	{orientation}
	class={cn('bg-input relative m-0! self-stretch data-[orientation=vertical]:h-auto', className)}
	{...restProps}
/>
