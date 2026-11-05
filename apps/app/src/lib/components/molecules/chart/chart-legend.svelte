<script lang="ts" module>
	/**
	 * How a series is drawn, which is how its swatch is drawn: `solid` for the
	 * measured line, `pattern` for a hatched fill, `dashed` for a comparison.
	 */
	export type LegendItem = { label: string; type: 'solid' | 'pattern' | 'dashed' };
</script>

<script lang="ts">
	/**
	 * The swatches beside a chart, as the old app's `ChartLegend` drew them:
	 * a two-pixel square per series, the hatched one hatched, 12px grey text.
	 * Text, so the series are named without hue (UI-7).
	 */
	import { cn } from '$lib/utils.js';

	let { items, class: className }: { items: LegendItem[]; class?: string } = $props();
</script>

{#if items.length > 0}
	<ul class={cn('flex flex-wrap items-center gap-4', className)}>
		{#each items as item (item.label)}
			<li class="flex items-center gap-2 text-[12px] text-[var(--chart-axis-text)]">
				{#if item.type === 'solid'}
					<span class="size-2 shrink-0 bg-[var(--chart-actual-line)]" aria-hidden="true"></span>
				{:else if item.type === 'pattern'}
					<span
						class="size-2 shrink-0 [background:repeating-linear-gradient(45deg,var(--chart-pattern-stroke),var(--chart-pattern-stroke)_1px,transparent_1px,transparent_2px)]"
						aria-hidden="true"
					></span>
				{:else}
					<span
						class="h-0 w-3 shrink-0 border-t-2 border-dashed border-[var(--chart-line-secondary)]"
						aria-hidden="true"
					></span>
				{/if}
				{item.label}
			</li>
		{/each}
	</ul>
{/if}
