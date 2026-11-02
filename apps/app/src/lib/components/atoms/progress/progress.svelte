<script lang="ts">
	import { Progress as ProgressPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	/*
	 * Ported from the old app's atoms/progress.tsx. The track and the
	 * indicator are square here, where the old ones were `rounded-full` (D52).
	 */
	let {
		ref = $bindable(null),
		class: className,
		indicatorClass,
		value = 0,
		max = 100,
		...restProps
	}: ProgressPrimitive.RootProps & { indicatorClass?: string } = $props();
</script>

<ProgressPrimitive.Root
	bind:ref
	data-slot="progress"
	class={cn('bg-secondary relative h-4 w-full overflow-hidden', className)}
	{value}
	{max}
	{...restProps}
>
	<div
		data-slot="progress-indicator"
		class={cn('bg-primary h-full w-full flex-1 transition-all', indicatorClass)}
		style="transform: translateX(-{100 - ((value ?? 0) / (max || 100)) * 100}%)"
	></div>
</ProgressPrimitive.Root>
