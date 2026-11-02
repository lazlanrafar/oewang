<script lang="ts">
	/**
	 * The dashboard shell.
	 *
	 * Measured against the live app at app.oewang.com rather than guessed:
	 * a 240px sidebar whose outer wrapper carries the only vertical rule, an
	 * inner panel at `bg-sidebar/70` with a blur behind it, and a 45px header
	 * with a translucent background and a bottom rule.
	 */
	import { LogOut, PanelLeft } from '@lucide/svelte';

	import SidebarNav from '$lib/components/shell/sidebar-nav.svelte';
	import ThemeToggle from '$lib/components/shell/theme-toggle.svelte';
	import WorkspaceSwitcher from '$lib/components/shell/workspace-switcher.svelte';
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
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
		<!--
			Header geometry measured on the live app: h-12, translucent with a
			blur, a bottom rule, an inner row at px-4 (px-6 from lg) with gap-3 and
			space-between, a size-7 toggle on the left behind a 1px by 15px
			separator, and size-8 controls on the right.

			Two things the live header carries are not copied, because copying
			them would mean shipping a control that does nothing: the global
			search, which has no endpoint here, and the notification bell, which
			belongs to a feature this rewrite drops.

			The live header shows no identity either; that lives in the sidebar.
		-->
		<header
			class="bg-background/50 sticky top-0 z-20 h-12 border-b backdrop-blur-md"
		>
			<div class="flex h-full w-full items-center justify-between gap-3 px-4 lg:px-6">
				<div class="flex min-w-0 items-center gap-3">
					<Sheet.Root bind:open={drawerOpen}>
						<Sheet.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-7 md:hidden"
									aria-label={t('nav.toggle_sidebar')}
								>
									<PanelLeft class="size-4" />
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

					<div class="bg-border h-[15px] w-px shrink-0 md:hidden" aria-hidden="true"></div>
				</div>

				<div class="flex items-center gap-1">
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
				</div>
			</div>
		</header>

		<!-- min-w-0 on every flex ancestor is what keeps a wide table from
		     forcing the page to scroll sideways at 375px (UI-6). -->
		<main class="min-w-0 flex-1 px-4 py-6 lg:px-6">
			{@render children()}
		</main>
	</div>
</div>
