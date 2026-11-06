<script lang="ts">
	/**
	 * The workspace switcher at the top of the sidebar, the old app's
	 * `WorkspaceSwitcher` (D94).
	 *
	 * The same trigger, a 48px row with the black cat tile, the workspace name
	 * over a second line and the up-down chevron, and the same menu: a label,
	 * one row per workspace with its letter in a bordered square, a rule, and
	 * "Add workspace". Changed from the old one, each a fix: the current
	 * workspace is ticked, the second line is the role (there are no plans),
	 * the ⌘1… shortcuts it printed but never bound are gone (they would also
	 * fight the browser's own tab shortcuts), and "Manage workspaces" leads to
	 * the workspaces page.
	 *
	 * Switching posts a plain form, so the whole shell reloads in the new
	 * workspace, as the old switcher reloaded the page.
	 */
	import Cat from '@lucide/svelte/icons/cat';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Loader2 from '@lucide/svelte/icons/loader-circle';
	import Plus from '@lucide/svelte/icons/plus';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import { tick } from 'svelte';

	import { page } from '$app/state';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';
	import { roleLabel, workspaceInitial } from '$lib/workspaces';

	import { WorkspacesCreateDialog } from '../workspaces/index.js';

	type Workspace = { id: string; name: string; role: string };

	let {
		workspaces,
		activeId,
		collapsed = false
	}: {
		workspaces: Workspace[];
		activeId: string;
		collapsed?: boolean;
	} = $props();

	const active = $derived(workspaces.find((workspace) => workspace.id === activeId));

	let switching = $state(false);
	let target = $state('');
	let form = $state<HTMLFormElement | null>(null);
	let creating = $state(false);

	/** The page to land on: this one, without a query that names a row. */
	const next = $derived(page.url.pathname);

	async function choose(workspace: Workspace) {
		if (workspace.id === activeId || switching) return;
		switching = true;
		target = workspace.id;
		await tick();
		form?.requestSubmit();
	}
</script>

<form bind:this={form} method="POST" action="/workspaces?/switch" class="hidden">
	<input type="hidden" name="workspace_id" value={target} />
	<input type="hidden" name="next" value={next} />
</form>

<!--
	Named by what it shows, the workspace and the role, while the sidebar is
	open: a label in place of visible text fails WCAG 2.5.3, since a voice
	user says what they see. Collapsed, only the icon shows, so the label
	names it instead. The menu it opens is announced by `aria-haspopup`.
-->
<div class={cn('flex flex-col gap-2 p-2', collapsed && 'items-center px-0')}>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class={cn(
						'flex w-full items-center gap-2 overflow-hidden text-left text-sm outline-hidden transition-[width,height,padding] hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
						collapsed ? 'size-8 justify-center p-0' : 'h-12 p-2'
					)}
					aria-label={collapsed ? t('nav.switch_workspace') : undefined}
				>
					<span
						class="flex aspect-square size-8 shrink-0 items-center justify-center rounded bg-foreground font-semibold text-background text-sm"
					>
						{#if switching}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<Cat class="size-4" />
						{/if}
					</span>
					{#if !collapsed}
						<span class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-semibold">{active?.name ?? ''}</span>
							<span class="truncate text-xs capitalize">{roleLabel(active?.role ?? '')}</span>
						</span>
						<ChevronsUpDown class="ml-auto size-4 shrink-0" />
					{/if}
				</button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content
			class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
			align="start"
			side="right"
			sideOffset={4}
		>
			<DropdownMenu.Label class="text-muted-foreground text-xs">
				{t('workspaces.switcher.title')}
			</DropdownMenu.Label>
			{#each workspaces as workspace (workspace.id)}
				<DropdownMenu.Item
					class="gap-2 p-2"
					disabled={switching}
					onSelect={() => choose(workspace)}
				>
					<div class="flex size-6 shrink-0 items-center justify-center border font-semibold text-xs">
						{workspaceInitial(workspace.name)}
					</div>
					<span class="truncate">{workspace.name}</span>
					{#if workspace.id === activeId}
						<Check class="ml-auto size-4" aria-label={t('workspaces.switcher.current')} />
					{/if}
				</DropdownMenu.Item>
			{/each}
			<DropdownMenu.Separator />
			<DropdownMenu.Item class="cursor-pointer gap-2 p-2" onSelect={() => (creating = true)}>
				<div class="flex size-6 items-center justify-center border bg-background">
					<Plus class="size-4" />
				</div>
				<div class="font-medium text-muted-foreground">{t('workspaces.switcher.add_workspace')}</div>
			</DropdownMenu.Item>
			<DropdownMenu.Item class="cursor-pointer gap-2 p-2">
				{#snippet child({ props })}
					<a {...props} href="/workspaces">
						<div class="flex size-6 items-center justify-center border bg-background">
							<Settings2 class="size-4" />
						</div>
						<div class="font-medium text-muted-foreground">{t('workspaces.switcher.manage')}</div>
					</a>
				{/snippet}
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<WorkspacesCreateDialog bind:open={creating} />
