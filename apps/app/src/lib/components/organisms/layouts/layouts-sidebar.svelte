<script lang="ts">
	/**
	 * The sidebar, as the live app's `AppSidebar` is laid out.
	 *
	 * It collapses to an icon rail rather than disappearing, which is what
	 * `collapsible="icon"` means there: 16rem open, 3rem collapsed, the
	 * labels gone and the icons centred. The rule lives on this wrapper, not
	 * on the panel inside it, so the panel's translucency does not wash it
	 * out.
	 *
	 * The app's sidebar opens with the workspace switcher over the app's
	 * rows. The console passes its own `top` and `groups` instead, so both
	 * shells are this one sidebar.
	 */
	import type { Snippet } from 'svelte';

	import type { NavGroup } from '$lib/nav';

	import SidebarNav from './layouts-sidebar-nav.svelte';
	import SidebarUsageBlock, { type SidebarUsage } from './layouts-sidebar-usage.svelte';
	import WorkspaceSwitcher from './layouts-workspace-switcher.svelte';
	import { cn } from '$lib/utils';

	let {
		workspaces = [],
		activeId = '',
		groups,
		top,
		collapsed = false,
		usage = null,
		onNavigate,
		class: className
	}: {
		/** The switcher's list; unused when `top` replaces the switcher. */
		workspaces?: { id: string; name: string; role: string }[];
		activeId?: string;
		/** The rows; the app's own when omitted. */
		groups?: NavGroup[];
		/** Drawn in place of the workspace switcher, told whether the rail is collapsed. */
		top?: Snippet<[boolean]>;
		/** Icon rail instead of the full panel. Ignored in the mobile sheet. */
		collapsed?: boolean;
		/** The workspace's usage at the foot; none in the console. Hidden on the rail. */
		usage?: SidebarUsage | null;
		onNavigate?: () => void;
		class?: string;
	} = $props();
</script>

<div
	data-state={collapsed ? 'collapsed' : 'expanded'}
	class={cn(
		'shrink-0 border-r transition-[width] duration-200 ease-linear',
		collapsed ? 'w-12' : 'w-64',
		className
	)}
>
	<div
		class="bg-sidebar/70 text-sidebar-foreground sticky top-0 flex h-svh flex-col overflow-hidden backdrop-blur-md"
	>
		{#if top}
			{@render top(collapsed)}
		{:else}
			<WorkspaceSwitcher {workspaces} {activeId} {collapsed} />
		{/if}
		<div class="flex-1 overflow-x-hidden overflow-y-auto">
			<SidebarNav {groups} {collapsed} {onNavigate} />
		</div>
		{#if usage && !collapsed}
			<SidebarUsageBlock {usage} {onNavigate} />
		{/if}
	</div>
</div>
