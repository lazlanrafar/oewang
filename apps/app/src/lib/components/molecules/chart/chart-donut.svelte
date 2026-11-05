<script lang="ts" module>
	export type DonutSlice = { label: string; value: number; formatted: string; share: string | null };
</script>

<script lang="ts">
	/**
	 * Shares of a whole, as a ring with a legend beside it (D89).
	 *
	 * Ported from the old app's `category-expense-donut-chart.tsx`. The legend
	 * carries every figure as text, so the ring is a picture of the table
	 * rather than the only place a number lives (UI-7). That is also why the
	 * ring has no tooltip: it would repeat the line beside it.
	 */
	import { PieChart } from 'layerchart';

	import { cn } from '$lib/utils.js';

	import { SLICE_COLORS } from './chart-shared.js';

	let {
		slices,
		label,
		class: className
	}: {
		slices: DonutSlice[];
		label: string;
		class?: string;
	} = $props();

	/*
	 * Keyed by position, not by label: a workspace may well have a category
	 * called "Other" beside the bucket of the same name.
	 */
	const colored = $derived(
		slices.map((slice, index) => ({
			...slice,
			key: String(index),
			color: SLICE_COLORS[index % SLICE_COLORS.length]
		}))
	);
</script>

<div class={cn('flex flex-col gap-4 sm:flex-row sm:items-center', className)} data-slot="chart-donut">
	<div class="size-48 shrink-0 self-center" role="img" aria-label={label}>
		<PieChart
			data={colored}
			key="key"
			label="label"
			value="value"
			c="color"
			cRange={colored.map((slice) => slice.color)}
			innerRadius={-22}
			padAngle={0.01}
			legend={false}
			tooltipContext={false}
		/>
	</div>

	<ul class="flex min-w-0 flex-1 flex-col gap-2">
		{#each colored as slice (slice.key)}
			<li class="text-small flex items-center justify-between gap-3">
				<span class="flex min-w-0 items-center gap-2">
					<span class="size-2 shrink-0" style:background-color={slice.color}></span>
					<span class="truncate">{slice.label}</span>
				</span>
				<span class="flex shrink-0 items-baseline gap-2">
					<span class="font-mono">{slice.formatted}</span>
					{#if slice.share}
						<span class="text-subtle text-caption w-12 text-right">{slice.share}</span>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</div>
