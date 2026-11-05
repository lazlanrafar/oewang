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
	 * A monthly series as a hatched area, the old app's `RevenueChart` and
	 * `BurnRateChart` (D89, D93).
	 *
	 * The measured series is a 2px solid line over the diagonal hatch; the
	 * average is a dashed line; a comparison, such as the same month a year
	 * earlier, is a thin secondary line. `outflow` draws the burn-rate form:
	 * a lighter hatch and a dot on every month. Heights come from
	 * `chartValue`; every figure a reader sees is the API's formatted string.
	 */
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, Points, Spline } from 'layerchart';

	import { cn } from '$lib/utils.js';

	import { AXIS, GRID, HATCH, compactTick, monthDate, monthTick } from './chart-shared.js';
	import ChartHatch from './chart-hatch.svelte';
	import ChartLegend, { type LegendItem } from './chart-legend.svelte';
	import ChartTooltip from './chart-tooltip.svelte';

	let {
		points,
		label,
		compareLabel,
		average,
		outflow = false,
		legend = true,
		height = 320,
		class: className
	}: {
		points: AreaPoint[];
		/** What the main series is, for the legend and the tooltip. */
		label: string;
		compareLabel?: string;
		average?: { value: number; formatted: string; label: string };
		/** The burn-rate form: lighter hatch, a dot per month. */
		outflow?: boolean;
		/** Off when the panel around the chart carries the legend in its header. */
		legend?: boolean;
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

	const hasCompare = $derived(
		compareLabel !== undefined && points.some((point) => point.compare !== undefined)
	);

	// Every series stays declared, so the scale's domain covers the average
	// and the comparison as well as the area.
	const series = $derived([
		{ key: 'value', label, value: 'value', color: 'var(--chart-actual-line)' },
		...(hasCompare
			? [{ key: 'compare', label: compareLabel ?? '', value: 'compare', color: 'var(--chart-line-secondary)' }]
			: []),
		...(average
			? [{ key: 'average', label: average.label, value: 'average', color: 'var(--chart-line-secondary)' }]
			: [])
	]);

	const legendItems = $derived<LegendItem[]>([
		{ label, type: 'solid' },
		...(hasCompare ? [{ label: compareLabel ?? '', type: 'dashed' as const }] : []),
		...(average ? [{ label: average.label, type: 'pattern' as const }] : [])
	]);
</script>

<div class={cn('flex w-full flex-col gap-4', className)} data-slot="chart-area">
	{#if legend}<ChartLegend items={legendItems} class="justify-end" />{/if}
	<div style:height="{height}px" role="img" aria-label={label}>
		<AreaChart
			{data}
			x="date"
			{series}
			seriesLayout="overlap"
			legend={false}
			grid={GRID}
			padding={{ left: 40, bottom: 20, top: 6, right: 6 }}
			props={{
				xAxis: { ...AXIS, format: (value: Date) => monthTick(value, withYear) },
				yAxis: { ...AXIS, format: (value: number) => compactTick(value) },
				highlight: { points: { r: 5, fill: 'var(--chart-actual-line)' } }
			}}
		>
			{#snippet marks()}
				<ChartHatch opacity={outflow ? HATCH.outflow : HATCH.area}>
					{#snippet content(pattern)}
						<Area
							seriesKey="value"
							curve={curveMonotoneX}
							fill={pattern}
							fillOpacity={1}
							line={{ stroke: 'var(--chart-actual-line)', class: 'stroke-2' }}
						/>
					{/snippet}
				</ChartHatch>
				{#if hasCompare}
					<Spline
						seriesKey="compare"
						curve={curveMonotoneX}
						stroke="var(--chart-line-secondary)"
						class="stroke-[1.5]"
					/>
				{/if}
				{#if average}
					<Spline
						seriesKey="average"
						curve={curveMonotoneX}
						stroke={outflow ? 'var(--chart-axis-text)' : 'var(--chart-line-secondary)'}
						class={cn('[stroke-dasharray:5_5]', outflow ? 'stroke-1' : 'stroke-2')}
					/>
				{/if}
				{#if outflow}
					<Points seriesKey="value" r={3} fill="var(--chart-actual-line)" stroke="none" />
				{/if}
			{/snippet}

			{#snippet tooltip({ context })}
				<ChartTooltip
					{context}
					title={(datum) => monthTick(datum.date as Date, true)}
					rows={(datum) => [
						{ label, value: String(datum.formatted) },
						...(hasCompare && datum.compareFormatted
							? [{ label: compareLabel ?? '', value: String(datum.compareFormatted) }]
							: []),
						...(average ? [{ label: average.label, value: average.formatted }] : [])
					]}
				/>
			{/snippet}
		</AreaChart>
	</div>
</div>
