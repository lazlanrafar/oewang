<script lang="ts">
	/** The swatches above a chart. Text, so the series are named without hue (UI-7). */
	let { items }: { items: { label: string; color: string }[] } = $props();
</script>

{#if items.length > 1}
	<ul class="text-caption text-subtle flex flex-wrap gap-x-4 gap-y-1">
		{#each items as item (item.label)}
			<li class="flex items-center gap-2">
				<span class="size-2 shrink-0" style:background-color={item.color}></span>
				{item.label}
			</li>
		{/each}
	</ul>
{/if}
