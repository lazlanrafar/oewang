<script lang="ts">
	/**
	 * The dashboard: the shared shell (`AppShell`) with the workspace's own
	 * sidebar and the account menu, and what only the app does around it.
	 *
	 * Two of the live header's controls are deliberately not here, because
	 * copying them would mean shipping a control that does nothing: the global
	 * search, which has no endpoint in this rewrite, and the notification
	 * bell, which belongs to a feature it drops. The account menu is the old
	 * avatar menu, trimmed to what exists here (D94).
	 */
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';

	import {
		AccountMenu,
		AppShell,
		AppSidebar,
		hasPageSkeleton,
		PageSkeleton
	} from '$lib/components/organisms/layouts';
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

	/*
	 * A list page on its way (D108). Its load blocks, so nothing of it can
	 * draw yet; the shell draws its frame and table skeleton instead of
	 * leaving the previous page up as if it were current. Only for a move
	 * between pages: a filter on the same page is the table's own skeleton,
	 * and a page without an entry here keeps the old behaviour.
	 */
	const arriving = $derived.by(() => {
		const id = navigating.to?.route.id;
		return id !== page.route.id && hasPageSkeleton(id) ? id : null;
	});

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
</script>

<AppShell sidebarOpen={data.sidebarOpen} style={colorStyle(userColors) || undefined}>
	{#snippet sidebar(props)}
		<AppSidebar workspaces={data.workspaces} activeId={data.me.workspace.id} {...props} />
	{/snippet}

	{#snippet account()}
		<AccountMenu
			name={data.me.user.name}
			email={data.me.user.email}
			photo={data.me.user.profile_picture
				? `/account/photo?v=${encodeURIComponent(data.me.user.profile_picture)}`
				: null}
		/>
	{/snippet}

	{#if arriving}
		<PageSkeleton route={arriving} />
	{:else}
		{@render children()}
	{/if}
</AppShell>
