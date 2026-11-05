<script lang="ts">
	/**
	 * A titled chart, the old app's `CanvasChart`: the title in the serif at
	 * 18px with the legend on its right, the chart below, and a dashed box
	 * saying so when there is nothing to draw.
	 */
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils.js';

	import ChartLegend, { type LegendItem } from './chart-legend.svelte';

	let {
		title,
		legend = [],
		empty,
		height = 320,
		children,
		class: className
	}: {
		title: string;
		legend?: LegendItem[];
		/** Set when there is nothing to draw: the dashed box shows this instead. */
		empty?: string | null;
		height?: number;
		children: Snippet;
		class?: string;
	} = $props();
</script>

<section class={cn('min-w-0 space-y-4', className)} data-slot="chart-panel">
	<div class="flex items-center justify-between gap-4">
		<h2 class="font-serif text-[18px] font-normal">{title}</h2>
		{#if !empty}<ChartLegend items={legend} />{/if}
	</div>
	{#if empty}
		<div
			class="flex items-center justify-center border border-dashed border-[var(--chart-grid-stroke)] text-[12px] text-[var(--chart-axis-text)]"
			style:height="{height}px"
		>
			{empty}
		</div>
	{:else}
		{@render children()}
	{/if}
</section>
