<script lang="ts">
	/**
	 * A chip under a message that opens something beside the conversation:
	 * an analysis in the canvas (D88), a receipt in its panel (OEW-135).
	 *
	 * `pressed` makes it a toggle that reads as pressed while what it opens
	 * is showing. Left out, the chip goes somewhere instead and announces no
	 * pressed state at all.
	 */
	import type { Snippet } from 'svelte';

	let {
		pressed,
		title,
		onclick,
		children
	}: {
		pressed?: boolean;
		title?: string;
		onclick: () => void;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	class="border-border text-caption hover:border-foreground/40 flex items-center gap-1.5 border px-2 py-1 transition-colors {pressed
		? 'bg-muted'
		: ''}"
	aria-pressed={pressed}
	{title}
	{onclick}
>
	{@render children()}
</button>
