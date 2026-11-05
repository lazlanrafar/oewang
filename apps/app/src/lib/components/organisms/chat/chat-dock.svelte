<script lang="ts">
	/**
	 * Where the composer floats: pinned to the bottom of the page's scroll
	 * box, over the content, centred in the column (D87).
	 *
	 * Sticky rather than fixed, so it stays inside whatever column holds it:
	 * beside the sidebar, and beside the canvas when the column narrows for
	 * it, with no offsets to keep in step with either.
	 *
	 * No backdrop of its own: the old composer floated over the page with
	 * only its own translucent, blurred box, so content shows around it
	 * rather than fading into a band of background.
	 *
	 * With `minimize`, it reads how far that box has scrolled and hands the
	 * composer a factor to fold by, as the old overview did. Reading the
	 * scroll is a genuine side effect; the folding rule is the composer's.
	 */
	import type { Snippet } from 'svelte';

	let {
		minimize = false,
		children
	}: {
		minimize?: boolean;
		children: Snippet<[{ compact: number }]>;
	} = $props();

	let dock = $state<HTMLDivElement | null>(null);
	let compact = $state(0);

	$effect(() => {
		if (!minimize || !dock) return;

		const box = scrollParent(dock);
		if (!box) return;

		const read = () => (compact = Math.min(1, Math.max(0, box.scrollTop / 400)));
		read();
		box.addEventListener('scroll', read, { passive: true });
		return () => box.removeEventListener('scroll', read);
	});

	function scrollParent(node: HTMLElement): HTMLElement | null {
		for (let parent = node.parentElement; parent; parent = parent.parentElement) {
			const { overflowY } = getComputedStyle(parent);
			if (overflowY === 'auto' || overflowY === 'scroll') return parent;
		}
		return null;
	}
</script>

<div
	bind:this={dock}
	class="pointer-events-none sticky bottom-0 z-10 mt-auto pt-6 pb-4 md:pb-6"
	data-slot="chat-dock"
>
	<div class="pointer-events-auto">
		{@render children({ compact })}
	</div>
</div>
