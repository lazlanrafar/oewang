<script lang="ts">
	/**
	 * The canvas: a side panel holding a real application component
	 * (D31, CHAT-13, UI-2).
	 *
	 * The shell and nothing else. What goes inside is passed in as a
	 * snippet, and it is the page's own form sheet or confirmation sheet
	 * rather than a second rendering of either
	 * (docs/features/chat.md#canvas). That is the whole design: the canvas
	 * is the real editor, so it cannot drift from it, and the model renders
	 * nothing.
	 *
	 * Whether it is open lives in the URL, which is the page's business.
	 * This component is told.
	 *
	 * **Not a dialog.** It does not cover the page, it does not trap focus
	 * and it has no overlay: the column beside it moves over and stays
	 * usable, which is the point of a canvas rather than a modal. So it is
	 * a labelled region, focus moves into it when it opens and back to
	 * whatever had it when it closes, and Escape closes it, because a panel
	 * that can be opened from a keyboard has to be closable from one too.
	 */
	import type { Snippet } from 'svelte';

	import X from '@lucide/svelte/icons/x';

	import { t } from '$lib/i18n';

	import { Button } from '../../atoms/button/index.js';

	let {
		open = false,
		title,
		description,
		onClose,
		children
	}: {
		open?: boolean;
		title: string;
		/** One line under the title, for what the panel is asking of the user. */
		description?: string;
		onClose: () => void;
		children: Snippet;
	} = $props();

	let panel = $state<HTMLElement | null>(null);
	let heading = $state<HTMLHeadingElement | null>(null);

	/**
	 * Whatever had focus when the panel opened, so it can have it back.
	 *
	 * Kept outside `$state`: nothing renders from it, and writing it in the
	 * same effect that reads it would be a loop.
	 */
	let opener: HTMLElement | null = null;

	/*
	 * Move focus in on open and back out on close.
	 *
	 * A genuine side effect: `focus()` is the DOM, not a value. The heading
	 * takes it rather than the close button, so a screen reader announces
	 * what the panel is before it announces the way out of it.
	 */
	$effect(() => {
		if (!open) return;

		const previous = document.activeElement;
		opener = previous instanceof HTMLElement ? previous : null;
		heading?.focus();

		return () => {
			// Only if focus is still inside the panel. The user may have
			// clicked away, and pulling focus back from wherever they went
			// is worse than leaving it there.
			if (panel?.contains(document.activeElement)) opener?.focus();
			opener = null;
		};
	});

	function keydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;

		// A picker or a combobox inside the panel handles its own Escape
		// and stops it here, so this only fires for an Escape nobody wanted.
		event.preventDefault();
		onClose();
	}
</script>

<svelte:window onkeydown={keydown} />

<!--
	Off-screen rather than unmounted while closed, so the panel slides
	instead of appearing, and `aria-hidden` plus `inert` keep what is in it
	out of the tab order and out of a screen reader while it is away.

	Geometry: under the 45px header, against the right edge, full width
	below the medium breakpoint and a fixed 560px above it. The conversation
	column animates its own margin to match, which is why nothing here
	pushes anything.
-->
<aside
	bind:this={panel}
	class="bg-background fixed inset-y-0 top-12 right-0 z-20 flex w-full flex-col border-l transition-transform duration-200 md:w-[560px] {open
		? 'translate-x-0'
		: 'translate-x-full'}"
	aria-labelledby="canvas-heading"
	aria-hidden={open ? undefined : 'true'}
	inert={!open}
>
	<header class="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4">
		<div class="min-w-0">
			<!-- Focusable so the panel can be announced on open, but not in
			     the tab order: it is a heading, not a control. -->
			<h2 id="canvas-heading" bind:this={heading} tabindex="-1" class="truncate text-lg">
				{title}
			</h2>
			{#if description}
				<p class="text-subtle text-caption mt-1">{description}</p>
			{/if}
		</div>

		<Button
			type="button"
			variant="ghost"
			size="icon"
			class="size-8 shrink-0"
			aria-label={t('canvas.close')}
			onclick={onClose}
		>
			<X class="size-4" />
		</Button>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{@render children()}
	</div>
</aside>
