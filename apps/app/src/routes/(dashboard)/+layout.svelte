<script lang="ts">
	import { LogOut, Menu } from '@lucide/svelte';

	import SidebarNav from '$lib/components/shell/sidebar-nav.svelte';
	import ThemeToggle from '$lib/components/shell/theme-toggle.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import { t } from '$lib/i18n';

	let { children, data } = $props();

	// Mobile only. Above the medium breakpoint the sidebar is always present,
	// so this never applies there.
	let drawerOpen = $state(false);
</script>

<div class="flex min-h-svh">
	<!-- Fixed rail from md up. Hidden below, where the drawer takes over. -->
	<aside
		class="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-60 shrink-0 border-r md:flex md:flex-col"
	>
		<div class="border-sidebar-border flex h-14 items-center border-b px-5">
			<span class="font-serif text-lg font-semibold tracking-tight">{t('app.name')}</span>
		</div>
		<div class="flex-1 overflow-y-auto">
			<SidebarNav />
		</div>
	</aside>

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur"
		>
			<Sheet.Root bind:open={drawerOpen}>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class="md:hidden"
							aria-label={t('nav.toggle_sidebar')}
						>
							<Menu class="size-4" />
						</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="left" class="bg-sidebar w-64 p-0">
					<Sheet.Header class="border-sidebar-border h-14 justify-center border-b px-5">
						<Sheet.Title class="font-serif text-lg font-semibold tracking-tight">
							{t('app.name')}
						</Sheet.Title>
					</Sheet.Header>
					<SidebarNav onNavigate={() => (drawerOpen = false)} />
				</Sheet.Content>
			</Sheet.Root>

			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium">{data.me.workspace.name}</p>
				<p class="text-muted-foreground truncate text-xs">
					{t('shell.signed_in_as', { email: data.me.user.email })}
				</p>
			</div>

			<ThemeToggle />

			<!-- A form, not a link: signing out is a state change, and a
			     GET that mutates is a GET a prefetcher can fire. -->
			<form method="POST" action="/logout">
				<Button type="submit" variant="ghost" size="icon" aria-label={t('nav.sign_out')}>
					<LogOut class="size-4" />
				</Button>
			</form>
		</header>

		<!-- min-w-0 on every flex ancestor is what keeps a wide table from
		     forcing the page to scroll sideways at 375px (UI-6). -->
		<main class="min-w-0 flex-1 px-4 py-6">
			{@render children()}
		</main>
	</div>
</div>
