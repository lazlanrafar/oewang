<script lang="ts">
	/**
	 * The diagonal hatch every chart fills with (D93): one-pixel lines at 45°
	 * on an eight-pixel tile, over the chart's own background, as the old
	 * app's `incomePattern` drew it. The density is the only thing a caller
	 * picks (`HATCH` in chart-shared), so the fill reads the same everywhere.
	 *
	 * Inside a chart only: it renders `<defs>` into the chart's SVG layer and
	 * hands its `url(#…)` to whatever it wraps.
	 */
	import { Pattern } from 'layerchart';
	import type { Snippet } from 'svelte';

	let {
		opacity,
		content
	}: {
		opacity: number;
		content: Snippet<[string]>;
	} = $props();
</script>

<Pattern
	size={8}
	lines={{ rotate: 45, color: 'var(--chart-pattern-stroke)', width: '1', opacity }}
	background="var(--chart-pattern-bg)"
>
	{#snippet children({ pattern })}
		{@render content(pattern)}
	{/snippet}
</Pattern>
