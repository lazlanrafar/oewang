<script lang="ts" module>
	export type BarItem = { label: string; value: number; formatted: string; share?: string | null };
</script>

<script lang="ts">
	/**
	 * A breakdown as hatched columns, the old app's `ExpensesChart` (D89, D93):
	 * each column a diagonal hatch with a one-pixel outline and a slightly
	 * rounded top, the category under it cut to sixteen characters, the full
	 * name and figure in the tooltip.
	 */
	import { Bars, BarChart } from 'layerchart';

	import { cn } from '$lib/utils.js';

	import { AXIS, GRID, HATCH, compactTick } from './chart-shared.js';
	import ChartHatch from './chart-hatch.svelte';
	import ChartTooltip from './chart-tooltip.svelte';

	let {
		items,
		label,
		height = 320,
		class: className
	}: {
		items: BarItem[];
		/** What is measured, for the tooltip and the accessible name. */
		label: string;
		height?: number;
		class?: string;
	} = $props();

	/*
	 * The band is the position, not the label: two bars with one name, such
	 * as a category called "Other" beside the bucket, must stay two bars.
	 */
	const data = $derived(items.map((item, index) => ({ ...item, key: String(index) })));
	const labelOf = (key: string) => {
		const name = data[Number(key)]?.label ?? '';
		return name.length > 16 ? `${name.slice(0, 15)}…` : name;
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
		x="key"
		y="value"
		series={[{ key: 'value', label, value: 'value', color: 'var(--chart-actual-line)' }]}
		legend={false}
		grid={GRID}
		bandPadding={0.3}
		padding={{ left: 40, bottom: 20, top: 6, right: 6 }}
		props={{
			xAxis: { ...AXIS, format: (value: string) => labelOf(value) },
			yAxis: { ...AXIS, format: (value: number) => compactTick(value) }
		}}
	>
		{#snippet marks()}
			<ChartHatch opacity={HATCH.outflow}>
				{#snippet content(pattern)}
					<Bars
						seriesKey="value"
						fill={pattern}
						stroke="var(--chart-actual-line)"
						strokeWidth={1}
						radius={2}
						rounded="top"
					/>
				{/snippet}
			</ChartHatch>
		{/snippet}

		{#snippet tooltip({ context })}
			<ChartTooltip
				{context}
				title={(datum) => String(datum.label)}
				rows={(datum) => [
					{
						label: datum.share ? `${label} · ${datum.share}` : label,
						value: String(datum.formatted)
					}
				]}
			/>
		{/snippet}
	</BarChart>
</div>
