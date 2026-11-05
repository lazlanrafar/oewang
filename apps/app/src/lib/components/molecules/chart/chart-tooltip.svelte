<script lang="ts">
	/**
	 * The tooltip every chart here shows: a heading and one row per series,
	 * each with the API's formatted figure. The chart never formats money.
	 */
	import { Tooltip } from 'layerchart';

	let {
		context,
		title,
		rows
	}: {
		context: unknown;
		title: (data: Record<string, unknown>) => string;
		rows: (data: Record<string, unknown>) => { label: string; value: string; color: string }[];
	} = $props();
</script>

<Tooltip.Root context={context as never} classes={{ root: 'z-30', container: 'p-0 bg-transparent shadow-none border-0' }}>
	{#snippet children({ data })}
		{@const datum = data as Record<string, unknown>}
		<div class="bg-popover text-popover-foreground border-border min-w-36 border px-3 py-2 shadow-sm">
			<p class="text-caption text-subtle mb-1">{title(datum)}</p>
			<ul class="flex flex-col gap-1">
				{#each rows(datum) as row (row.label)}
					<li class="text-small flex items-center justify-between gap-4">
						<span class="flex items-center gap-2">
							<span class="size-2 shrink-0" style:background-color={row.color}></span>
							{row.label}
						</span>
						<span class="font-mono">{row.value}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/snippet}
</Tooltip.Root>
