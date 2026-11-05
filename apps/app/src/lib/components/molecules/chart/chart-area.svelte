<script lang="ts" module>
	/** One month on the chart. `value` is for drawing only; the tooltip shows `formatted`. */
	export type AreaPoint = {
		month: string;
		value: number;
		formatted: string;
		/** A second series drawn as a thin line, such as the same month a year earlier. */
		compare?: number;
		compareFormatted?: string;
	};
</script>

<script lang="ts">
	/**
	 * A monthly series as an area, with an optional comparison line and an
	 * optional dashed average (D89).
	 *
	 * Ported from the old app's `revenue-chart.tsx` and `burn-rate-chart.tsx`,
	 * which were the same chart twice. Heights come from `chartValue`; every
	 * figure a reader sees is the API's formatted string.
	 */
	import { AreaChart } from 'layerchart';

	import { cn } from '$lib/utils.js';

	import { CHART_COLORS, compactTick, monthDate, monthTick } from './chart-shared.js';
	import ChartTooltip from './chart-tooltip.svelte';
	import ChartLegend from './chart-legend.svelte';

	let {
		points,
		label,
		compareLabel,
		average,
		height = 240,
		class: className
	}: {
		points: AreaPoint[];
		/** What the main series is, for the legend and the tooltip. */
		label: string;
		compareLabel?: string;
		average?: { value: number; formatted: string; label: string };
		height?: number;
		class?: string;
	} = $props();

	const withYear = $derived(new Set(points.map((point) => point.month.slice(0, 4))).size > 1);

	const data = $derived(
		points.map((point) => ({
			...point,
			date: monthDate(point.month),
			average: average?.value ?? 0
		}))
	);

	const hasCompare = $derived(compareLabel !== undefined && points.some((p) => p.compare !== undefined));

	const series = $derived([
		{ key: 'value', label, value: 'value', color: CHART_COLORS[0] },
		...(hasCompare
			? [
					{
						key: 'compare',
						label: compareLabel ?? '',
						value: 'compare',
						color: CHART_COLORS[2],
						props: { fillOpacity: 0 }
					}
				]
			: []),
		...(average
			? [
					{
						key: 'average',
						label: average.label,
						value: 'average',
						color: CHART_COLORS[1],
						props: { fillOpacity: 0, line: { class: '[stroke-dasharray:4_4]' } }
					}
				]
			: [])
	]);

	const legend = $derived(series.map((entry) => ({ label: entry.label, color: entry.color })));
</script>

<div class={cn('flex flex-col gap-3', className)} data-slot="chart-area">
	<ChartLegend items={legend} />
	<div style:height="{height}px" role="img" aria-label={label}>
		<AreaChart
			{data}
			x="date"
			{series}
			seriesLayout="overlap"
			legend={false}
			props={{
				xAxis: { format: (value: Date) => monthTick(value, withYear) },
				yAxis: { format: (value: number) => compactTick(value) }
			}}
		>
			{#snippet tooltip({ context })}
				<ChartTooltip
					{context}
					title={(datum) => monthTick(datum.date as Date, true)}
					rows={(datum) => [
						{ label, value: String(datum.formatted), color: CHART_COLORS[0] },
						...(hasCompare && datum.compareFormatted
							? [{ label: compareLabel ?? '', value: String(datum.compareFormatted), color: CHART_COLORS[2] }]
							: []),
						...(average ? [{ label: average.label, value: average.formatted, color: CHART_COLORS[1] }] : [])
					]}
				/>
			{/snippet}
		</AreaChart>
	</div>
</div>
