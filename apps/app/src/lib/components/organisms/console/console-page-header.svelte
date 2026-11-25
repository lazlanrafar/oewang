<script lang="ts">
	/**
	 * The heading of a console page that is figures rather than a list
	 * (overview, usage, health), drawn as the app's overview heads its page:
	 * the serif title over a subtle line, any controls on the right. List
	 * screens have none, per D81.
	 */
	import type { Snippet } from 'svelte';

	let { title, description, controls }: { title: string; description: string; controls?: Snippet } = $props();
</script>

<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
	<div class="min-w-0">
		<h1 class="min-h-8 truncate font-serif text-2xl">{title}</h1>
		<p class="text-subtle text-small">{description}</p>
	</div>
	{#if controls}
		<div class="flex flex-wrap items-center gap-2">{@render controls()}</div>
	{/if}
</div>
