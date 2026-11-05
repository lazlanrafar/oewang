<script lang="ts">
	/**
	 * One navigation row, shared by the app sidebar and the settings sidebar.
	 *
	 * Measured against the live app at app.oewang.com: 34 high (`h-9` at a
	 * 15px root), 7.5px of padding and gap, 13.125px text, square, active at
	 * the accent fill and weight 500 against 400.
	 *
	 * The active row is not just a grey fill. `SidebarMenuButton` in the old
	 * `packages/ui/src/components/atoms/sidebar.tsx` gives it a 2px left
	 * border, the accent fill, weight 500, and a 45 degree hatch drawn with
	 * `--chart-pattern-stroke` at 5 percent. Copied exactly, because the
	 * hatch is what makes it read as the current page rather than as a
	 * hovered one: a hovered row is the same fill at half strength. It lives
	 * here once, so the two sidebars cannot disagree about it (D81).
	 *
	 * The hatch is written out in the markup rather than held in a constant,
	 * because Tailwind reads the source for class names and never sees one
	 * that is assembled at runtime.
	 */
	import type { Component } from 'svelte';

	import { cn } from '$lib/utils';

	let {
		href,
		title,
		icon: Icon,
		active = false,
		pending = false,
		collapsed = false,
		badge,
		onNavigate
	}: {
		href: string;
		/** Already translated (UI-1). */
		title: string;
		icon: Component;
		active?: boolean;
		/** Not built yet: rendered, never linked, so the shell never links into a 404. */
		pending?: boolean;
		/** Icon rail: the title becomes screen-reader text and a tooltip. */
		collapsed?: boolean;
		/** A short tag on the right, such as "Soon". Hidden on the rail. */
		badge?: string;
		onNavigate?: () => void;
	} = $props();
</script>

{#snippet content()}
	<Icon class="size-4 shrink-0" />
	{#if collapsed}
		<span class="sr-only">{title}</span>
	{:else}
		<span class="min-w-0 flex-1 truncate">{title}</span>
		{#if badge}
			<span
				class="bg-muted/50 text-muted-foreground ml-auto shrink-0 border px-1.5 py-0.5 text-[10px] font-medium"
			>
				{badge}
			</span>
		{/if}
	{/if}
{/snippet}

{#if pending}
	<span
		class={cn(
			'text-sidebar-foreground/50 flex h-9 items-center gap-2 border-l-2 border-transparent px-2 text-sm',
			collapsed && 'justify-center px-0'
		)}
		aria-disabled="true"
		title={collapsed ? title : undefined}
	>
		{@render content()}
	</span>
{:else}
	<a
		{href}
		onclick={onNavigate}
		aria-current={active ? 'page' : undefined}
		title={collapsed ? title : undefined}
		class={cn(
			'flex h-9 items-center gap-2 border-l-2 border-transparent px-2 text-sm transition-colors',
			'hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
			active &&
				'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent font-medium [background-image:repeating-linear-gradient(45deg,transparent_0_5px,color-mix(in_srgb,var(--chart-pattern-stroke)_5%,transparent)_5px_6px)]',
			collapsed && 'justify-center px-0'
		)}
	>
		{@render content()}
	</a>
{/if}
