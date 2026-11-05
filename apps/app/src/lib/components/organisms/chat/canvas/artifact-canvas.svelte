<script lang="ts">
	/** The analysis a canvas entry holds, by kind (D88). */
	import type { ArtifactEntry } from '$lib/artifacts';

	import CanvasBurnRate from './canvas-burn-rate.svelte';
	import CanvasIncome from './canvas-income.svelte';
	import CanvasSpending from './canvas-spending.svelte';

	let { entry }: { entry: ArtifactEntry } = $props();
</script>

{#if entry.kind === 'spending'}
	<CanvasSpending report={entry.payload} />
{:else if entry.kind === 'income'}
	<CanvasIncome report={entry.payload} />
{:else}
	<CanvasBurnRate report={entry.payload} />
{/if}
