<script lang="ts">
	/**
	 * The dashboard shell.
	 *
	 * Measured against the live app at app.oewang.com rather than guessed:
	 * a 240px sidebar whose outer wrapper carries the only vertical rule, an
	 * inner panel at `bg-sidebar/70` with a blur behind it, and a 45px header
	 * with a translucent background and a bottom rule.
	 */
	import { LogOut, Menu } from '@lucide/svelte';

	import SidebarNav from '$lib/components/shell/sidebar-nav.svelte';
	import ThemeToggle from '$lib/components/shell/theme-toggle.svelte';
	import WorkspaceSwitcher from '$lib/components/shell/workspace-switcher.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import { t } from '$lib/i18n';

	let { children, data } = $props();

	// Mobile only. Above the medium breakpoint the sidebar is always present.
	let drawerOpen = $state(false);
</script>

<div class="flex min-h-svh w-full">
	<!-- The rule lives on this wrapper, not on the panel inside it, so the
	     panel's translucency does not wash it out. -->
	<div class="hidden w-64 shrink-0 border-r md:block">
		<div class="bg-sidebar/70 text-sidebar-foreground sticky top-0 flex h-svh flex-col backdrop-blur-md">
			<WorkspaceSwitcher name={data.me.workspace.name} secondary={data.me.role} />
			<div class="flex-1 overflow-y-auto">
				<SidebarNav />
			</div>
		</div>
	</div>

	<div class="flex min-w-0 flex-1 flex-col">
		<header
			class="bg-background/50 sticky top-0 z-20 flex h-12 items-center gap-2 border-b px-3 backdrop-blur-md"
		>
			<Sheet.Root bind:open={drawerOpen}>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class="size-8 md:hidden"
							aria-label={t('nav.toggle_sidebar')}
						>
							<Menu class="size-4" />
						</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="left" class="bg-sidebar w-64 p-0">
					<Sheet.Header class="p-0">
						<Sheet.Title class="sr-only">{t('nav.toggle_sidebar')}</Sheet.Title>
						<WorkspaceSwitcher name={data.me.workspace.name} secondary={data.me.role} />
					</Sheet.Header>
					<SidebarNav onNavigate={() => (drawerOpen = false)} />
				</Sheet.Content>
			</Sheet.Root>

			<div class="min-w-0 flex-1">
				<p class="text-muted-foreground truncate text-xs">
					{t('shell.signed_in_as', { email: data.me.user.email })}
				</p>
			</div>

			<ThemeToggle />

			<!-- A form, not a link: signing out is a state change, and a GET
			     that mutates is a GET a prefetcher can fire. -->
			<form method="POST" action="/logout">
				<Button
					type="submit"
					variant="ghost"
					size="icon"
					class="size-8"
					aria-label={t('nav.sign_out')}
				>
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
