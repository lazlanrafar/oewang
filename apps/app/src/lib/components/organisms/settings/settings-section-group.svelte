<script lang="ts">
	/**
	 * One group of fields inside a settings section: a small heading, a line
	 * of what it changes, and its fields. No card and no border; groups are
	 * separated by a rule between them, so a section reads as one page.
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		children
	}: { title: string; description?: string; children: Snippet } = $props();
</script>

<section class="flex flex-col gap-4">
	<div class="flex flex-col gap-1">
		<h2 class="text-sm font-medium">{title}</h2>
		{#if description}
			<p class="text-subtle text-xs">{description}</p>
		{/if}
	</div>
	{@render children()}
</section>
