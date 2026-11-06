<script lang="ts">
	/**
	 * The dashboard shell, laid out as the live app's `(dashboard)/layout.tsx`
	 * lays it out.
	 *
	 * The shape, class for class where the classes mean the same thing: the
	 * sidebar beside an inset that is `h-svh min-w-0 overflow-hidden`, a 12
	 * high header that is sticky, translucent and ruled underneath, with the
	 * sidebar trigger then a vertical separator on its left and the account
	 * controls on its right, and a content area at `p-4 md:p-6` that is the
	 * thing that scrolls.
	 *
	 * Two of the live header's controls are deliberately not here, because
	 * copying them would mean shipping a control that does nothing: the global
	 * search, which has no endpoint in this rewrite, and the notification
	 * bell, which belongs to a feature it drops. The account menu is the old
	 * avatar menu, trimmed to what exists here (D94).
	 */
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';

	import { PanelLeft } from '@lucide/svelte';

	import { AccountMenu, AppSidebar, rememberSidebar, SIDEBAR_SHORTCUT } from '$lib/components/organisms/layouts';
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Toaster } from '$lib/components/atoms/sonner';
	import { t } from '$lib/i18n';
	import { setWorkspaceLists } from '$lib/workspace-data.svelte';
	import { applyColors, colorStyle } from '$lib/colors';
	import { formatMoney } from '$lib/money';

	let { children, data } = $props();

	/*
	 * The workspace's own lists, published for every picker under this
	 * layout, so a call site writes `<SelectCategory type="expense" />` and
	 * not three mapped arrays. A getter, so a navigation that reloads them
	 * reaches the pickers already on screen.
	 */
	setWorkspaceLists(() => data.lists);

	/**
	 * Seeded from the cookie, so the first paint is already the right shape,
	 * and only seeded: after that the reader's own toggling owns it, and a
	 * navigation re-running the load must not undo a collapse. `untrack`
	 * says that rather than leaving it as a warning someone later "fixes".
	 */
	let open = $state(untrack(() => data.sidebarOpen));

	/*
	 * Queued receipts that ended while the person was away (D95): each is
	 * told once, as a toast, and then marked seen so the next page does not
	 * tell it again.
	 */
	const told = new Set<string>();
	$effect(() => {
		const fresh = data.receiptNotices.filter((notice) => !told.has(notice.id));
		if (fresh.length === 0) return;

		for (const notice of fresh) {
			told.add(notice.id);
			if (notice.status === 'done' && notice.transaction_id) {
				const name = notice.transaction_name ?? notice.file_name;
				const id = notice.transaction_id;
				toast.success(
					notice.amount && notice.currency_code
						? t('receipt.notice_saved', {
								name,
								amount: formatMoney(notice.amount, notice.currency_code)
							})
						: t('receipt.notice_saved_plain', { name }),
					{
						action: {
							label: t('receipt.notice_view'),
							onClick: () => goto(`/transactions?detail=${encodeURIComponent(id)}`)
						}
					}
				);
			} else {
				toast.error(t('receipt.notice_failed', { name: notice.file_name }));
			}
		}

		void fetch('/receipts/seen', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ids: fresh.map((notice) => notice.id) })
		});
	});
	let drawerOpen = $state(false);

	/*
	 * The reader's income and expense colours (UI-12, D100). On the shell's
	 * own element for the first paint, which is server-rendered, and on the
	 * document root once running, because sheets and menus are portals
	 * outside the shell. Taken off again when the shell goes.
	 */
	const userColors = $derived({
		income_color: data.me.user.income_color,
		expense_color: data.me.user.expense_color
	});
	$effect(() => applyColors(userColors));

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

<div class="flex h-svh w-full overflow-hidden" style={colorStyle(userColors) || undefined}>
	<AppSidebar
		workspaces={data.workspaces}
		activeId={data.me.workspace.id}
		collapsed={!open}
		class="hidden md:block"
	/>

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
							<AppSidebar
								workspaces={data.workspaces}
								activeId={data.me.workspace.id}
								class="w-full border-r-0"
								onNavigate={() => (drawerOpen = false)}
							/>
						</Sheet.Content>
					</Sheet.Root>

					<div class="bg-border mx-2 h-4 w-px shrink-0" aria-hidden="true"></div>
				</div>

				<div class="flex items-center gap-1">
					<AccountMenu
						name={data.me.user.name}
						email={data.me.user.email}
						photo={data.me.user.profile_picture
							? `/account/photo?v=${encodeURIComponent(data.me.user.profile_picture)}`
							: null}
					/>
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
