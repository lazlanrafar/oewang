<script lang="ts" module>
	export type BarItem = { label: string; value: number; formatted: string; share?: string | null };
</script>

<script lang="ts">
	/**
	 * A breakdown as horizontal bars, largest first (D89).
	 *
	 * Ported from the old app's `expenses-chart.tsx`. Horizontal rather than
	 * upright, so a category name is read rather than truncated to sixteen
	 * characters under a column.
	 */
	import { BarChart } from 'layerchart';

	import { cn } from '$lib/utils.js';

	import { CHART_COLORS, compactTick } from './chart-shared.js';
	import ChartTooltip from './chart-tooltip.svelte';

	let {
		items,
		label,
		class: className
	}: {
		items: BarItem[];
		/** What is measured, for the tooltip and the accessible name. */
		label: string;
		class?: string;
	} = $props();

	const height = $derived(Math.max(120, items.length * 36 + 32));

	/*
	 * The band is the position, not the label: two bars with one name, such
	 * as a category called "Other" beside the bucket, must stay two bars.
	 */
	const data = $derived(items.map((item, index) => ({ ...item, key: String(index) })));
	const labelOf = (key: string) => {
		const label = data[Number(key)]?.label ?? '';
		return label.length > 14 ? `${label.slice(0, 13)}…` : label;
	};
</script>

<div
	class={cn('w-full', className)}
	style:height="{height}px"
	role="img"
	aria-label={label}
	data-slot="chart-bar"
>
	<BarChart
		{data}
		x="value"
		y="key"
		orientation="horizontal"
		series={[{ key: 'value', label, value: 'value', color: CHART_COLORS[0] }]}
		legend={false}
		bandPadding={0.35}
		padding={{ left: 104, bottom: 24, right: 8 }}
		props={{
			xAxis: { format: (value: number) => compactTick(value) },
			yAxis: { format: (value: string) => labelOf(value) }
		}}
	>
		{#snippet tooltip({ context })}
			<ChartTooltip
				{context}
				title={(datum) => String(datum.label)}
				rows={(datum) => [
					{
						label: datum.share ? `${label} · ${datum.share}` : label,
						value: String(datum.formatted),
						color: CHART_COLORS[0]
					}
				]}
			/>
		{/snippet}
	</BarChart>
</div>
