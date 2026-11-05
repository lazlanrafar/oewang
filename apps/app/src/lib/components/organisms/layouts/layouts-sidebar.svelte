<script lang="ts">
	/**
	 * The sidebar, as the live app's `AppSidebar` is laid out.
	 *
	 * It collapses to an icon rail rather than disappearing, which is what
	 * `collapsible="icon"` means there: 16rem open, 3rem collapsed, the
	 * labels gone and the icons centred. The rule lives on this wrapper, not
	 * on the panel inside it, so the panel's translucency does not wash it
	 * out.
	 */
	import SidebarNav from './layouts-sidebar-nav.svelte';
	import WorkspaceSwitcher from './layouts-workspace-switcher.svelte';
	import { cn } from '$lib/utils';

	let {
		name,
		secondary,
		collapsed = false,
		onNavigate,
		class: className
	}: {
		name: string;
		secondary: string;
		/** Icon rail instead of the full panel. Ignored in the mobile sheet. */
		collapsed?: boolean;
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
		<WorkspaceSwitcher {name} {secondary} {collapsed} />
		<div class="flex-1 overflow-x-hidden overflow-y-auto">
			<SidebarNav {collapsed} {onNavigate} />
		</div>
	</div>
</div>
