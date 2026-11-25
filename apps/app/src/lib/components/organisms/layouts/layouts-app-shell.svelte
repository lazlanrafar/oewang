<script lang="ts">
	/**
	 * The dashboard shell, laid out as the live app's `(dashboard)/layout.tsx`
	 * lays it out, and shared by the operator console so both are one shell.
	 *
	 * The shape, class for class where the classes mean the same thing: the
	 * sidebar beside an inset that is `h-svh min-w-0 overflow-hidden`, a 12
	 * high header that is sticky, translucent and ruled underneath, with the
	 * sidebar trigger then a vertical separator on its left and the account
	 * controls on its right, and a content area at `p-4 md:p-6` that is the
	 * thing that scrolls.
	 *
	 * The caller says which sidebar and which account controls; the shell
	 * owns collapsing, the mobile drawer, the shortcut and the remembered
	 * state (`SIDEBAR_COOKIE`).
	 */
	import { untrack, type Snippet } from 'svelte';

	import { PanelLeft } from '@lucide/svelte';

	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Toaster } from '$lib/components/atoms/sonner';
	import { t } from '$lib/i18n';

	import { rememberSidebar, SIDEBAR_SHORTCUT } from './layouts-sidebar-state.js';

	let {
		sidebarOpen,
		style,
		sidebar,
		account,
		children
	}: {
		/** The remembered state, read from the cookie by the layout's load. */
		sidebarOpen: boolean;
		/** Custom properties on the shell's own element, such as the reader's colours. */
		style?: string;
		/** The sidebar, drawn twice: the rail, and inside the mobile drawer. */
		sidebar: Snippet<[{ collapsed: boolean; class: string; onNavigate?: () => void }]>;
		/** The controls at the header's right. */
		account: Snippet;
		children: Snippet;
	} = $props();

	/**
	 * Seeded from the cookie, so the first paint is already the right shape,
	 * and only seeded: after that the reader's own toggling owns it, and a
	 * navigation re-running the load must not undo a collapse. `untrack`
	 * says that rather than leaving it as a warning someone later "fixes".
	 */
	let open = $state(untrack(() => sidebarOpen));
	let drawerOpen = $state(false);

	function toggle() {
		open = !open;
		rememberSidebar(open);
	}

	/**
	 * The same chord the live app binds. It is on the window rather than on
	 * the trigger, because the point of it is reaching the sidebar from
	 * wherever the focus happens to be.
	 */
	function onkeydown(event: KeyboardEvent) {
		if (event.key !== SIDEBAR_SHORTCUT || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		toggle();
	}
</script>

<svelte:window {onkeydown} />

<!-- One toaster for the whole shell: a confirmation belongs to the app, not
     to the screen that happened to trigger it. -->
<Toaster />

<div class="flex h-svh w-full overflow-hidden" {style}>
	{@render sidebar({ collapsed: !open, class: 'hidden md:block' })}

	<div class="flex h-svh min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="bg-background/50 sticky top-0 z-50 flex h-12 shrink-0 items-center gap-2 overflow-hidden border-b backdrop-blur-md transition-[width,height] ease-linear"
		>
			<div class="flex w-full items-center justify-between gap-3 px-4 lg:px-6">
				<div class="flex flex-1 items-center gap-1 lg:gap-2">
					<!-- Above the medium breakpoint this collapses the rail; below
					     it there is no rail to collapse, so it opens the drawer. -->
					<Button
						variant="ghost"
						size="icon"
						class="-ml-1 hidden size-7 md:inline-flex"
						aria-label={t('nav.toggle_sidebar')}
						aria-expanded={open}
						onclick={toggle}
					>
						<PanelLeft class="size-4" />
					</Button>

					<Sheet.Root bind:open={drawerOpen}>
						<Sheet.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="-ml-1 size-7 md:hidden"
									aria-label={t('nav.toggle_sidebar')}
								>
									<PanelLeft class="size-4" />
								</Button>
							{/snippet}
						</Sheet.Trigger>
						<Sheet.Content side="left" class="bg-sidebar w-64 p-0">
							<Sheet.Header class="p-0">
								<Sheet.Title class="sr-only">{t('nav.toggle_sidebar')}</Sheet.Title>
							</Sheet.Header>
							{@render sidebar({
								collapsed: false,
								class: 'w-full border-r-0',
								onNavigate: () => (drawerOpen = false)
							})}
						</Sheet.Content>
					</Sheet.Root>

					<div class="bg-border mx-2 h-4 w-px shrink-0" aria-hidden="true"></div>
				</div>

				<div class="flex items-center gap-1">
					{@render account()}
				</div>
			</div>
		</header>

		<!-- The one scrolling box. `min-w-0` on every flex ancestor is what
		     keeps a wide table from making the page scroll sideways (UI-6). -->
		<main class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">
			{@render children()}
		</main>
	</div>
</div>
