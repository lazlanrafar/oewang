<script lang="ts">
	/**
	 * One specimen: a title, the note that says what the component is for,
	 * and the preview itself on a framed surface.
	 *
	 * Every section used to repeat the same heading snippet and the same
	 * wrapper classes, so a specimen looked slightly different depending on
	 * who wrote it. This is the one place those classes live, which is the
	 * same argument the design system makes to the rest of the app.
	 *
	 * The `data-specimen` attribute is what the page's own navigation reads:
	 * the list of sections is built from what is actually rendered, so a new
	 * specimen appears in the nav without being registered anywhere.
	 */
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	let {
		title,
		note,
		/** `false` for a specimen that brings its own frame, such as a table. */
		framed = true,
		/** The import line, so a reader can copy what they are looking at. */
		source,
		class: className,
		children
	}: {
		title: string;
		note?: string;
		framed?: boolean;
		source?: string;
		class?: string;
		children: Snippet;
	} = $props();

	/**
	 * Stable enough for an anchor, and derived rather than hand-written.
	 *
	 * `specimen-`, not `spec-`: the measured probes inside the sections carry
	 * `spec-button`, `spec-select` and so on, and a section titled "Button"
	 * would have taken that id away from the probe. `getElementById` returns
	 * the first match, so the comparison would have measured a section.
	 */
	const id = $derived(
		`specimen-${title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')}`
	);
</script>

<section {id} data-specimen data-title={title} class="scroll-mt-6 space-y-3">
	<div class="space-y-1">
		<h3 class="text-h3">{title}</h3>
		{#if note}<p class="text-subtle text-small max-w-3xl">{note}</p>{/if}
		{#if source}<p class="text-subtle text-caption font-mono">{source}</p>{/if}
	</div>

	<div class={cn(framed && 'bg-background border p-4', className)}>
		{@render children()}
	</div>
</section>
