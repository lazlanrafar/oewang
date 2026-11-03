<script lang="ts">
	import { Select as SelectPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "$lib/utils.js";
	import type { WithoutChildrenOrChild } from "$lib/utils.js";
	import SelectPortal from "./select-portal.svelte";
	import SelectScrollDownButton from "./select-scroll-down-button.svelte";
	import SelectScrollUpButton from "./select-scroll-up-button.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		// An open menu does not freeze the page. bits-ui's default locks
		// the body, which is how a native select behaves, but here the list
		// sits on a long page beside the field it belongs to, and a reader
		// who reaches for the wheel gets nothing and no reason why. The
		// list stays attached to its trigger as the page moves.
		preventScroll = false,
		// Pinned, rather than left to follow `preventScroll`: bits-ui reads
		// the positioning strategy off that prop, and an unlocked page would
		// otherwise get an `absolute` portal, which is laid out at the
		// document's top left for the frame before Floating UI places it.
		// Anything inside it that scrolls itself into view in that frame
		// takes the whole document to the top with it.
		strategy = "fixed",
		...restProps
	}: WithoutChild<SelectPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPortal>>;
	} = $props();
</script>

<SelectPortal {...portalProps}>
	<SelectPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		{strategy}
		data-slot="select-content"
		class={cn(
			"border bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-36 rounded-none duration-100 relative z-50 max-h-(--bits-select-content-available-height) origin-(--bits-select-content-transform-origin) overflow-x-hidden overflow-y-auto",
			className
		)}
		{...restProps}
	>
		<SelectScrollUpButton />
		<SelectPrimitive.Viewport
			class={cn(
				"h-(--bits-select-anchor-height) w-full min-w-(--bits-select-anchor-width) scroll-my-1"
			)}
		>
			{@render children?.()}
		</SelectPrimitive.Viewport>
		<SelectScrollDownButton />
	</SelectPrimitive.Content>
</SelectPortal>
