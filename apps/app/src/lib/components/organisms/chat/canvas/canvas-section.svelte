<script lang="ts">
	/** One titled block of an analysis canvas. */
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<section class="flex flex-col gap-3">
	<h3 class="font-serif text-lg">{title}</h3>
	{@render children()}
</section>
