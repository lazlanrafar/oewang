<script lang="ts">
	import { Popover as PopoverPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import PopoverPortal from "./popover-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		align = "center",
		// bits-ui picks the positioning strategy from `preventScroll`, and a
		// popover does not lock the page, so it would default to `absolute`.
		// An absolutely positioned portal is laid out at the document's top
		// left for the frame before Floating UI places it, and anything inside
		// that calls `scrollIntoView` in that frame, which the command list
		// does for its selected row, scrolls the whole document to the top. A
		// fixed portal starts inside the viewport instead, so the same call
		// finds the row already in view and moves nothing.
		strategy = "fixed",
		portalProps,
		...restProps
	}: PopoverPrimitive.ContentProps & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
	} = $props();
</script>

<PopoverPortal {...portalProps}>
	<PopoverPrimitive.Content
		bind:ref
		data-slot="popover-content"
		{sideOffset}
		{align}
		{strategy}
		class={cn(
			"border bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 flex flex-col gap-2.5 rounded-none p-2.5 text-sm duration-100 z-50 w-72 origin-(--bits-popover-content-transform-origin)",
			className
		)}
		{...restProps}
	/>
</PopoverPortal>
