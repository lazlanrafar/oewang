<script lang="ts">
	/**
	 * The tooltip every chart here shows, the old app's `StyledTooltip`: a
	 * square box, 10px type, the heading in grey and one "name: value" line
	 * per series. Every value is the API's formatted figure; the chart never
	 * formats money.
	 */
	import { Tooltip } from 'layerchart';

	let {
		context,
		title,
		rows
	}: {
		context: unknown;
		title: (data: Record<string, unknown>) => string;
		rows: (data: Record<string, unknown>) => { label: string; value: string }[];
	} = $props();
</script>

<Tooltip.Root
	context={context as never}
	classes={{ root: 'z-30', container: 'p-0 bg-transparent shadow-none border-0 rounded-none' }}
>
	{#snippet children({ data })}
		{@const datum = data as Record<string, unknown>}
		<div
			class="border-border bg-background text-foreground border p-2 text-[10px] shadow-[0_2px_6px_rgba(0,0,0,0.1)]"
		>
			<p class="mb-1 text-[var(--chart-axis-text)]">{title(datum)}</p>
			{#each rows(datum) as row (row.label)}
				<p>{row.label}: <span class="font-mono">{row.value}</span></p>
			{/each}
		</div>
	{/snippet}
</Tooltip.Root>
