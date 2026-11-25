<script lang="ts">
	/**
	 * The console's users (CSL-3, US-081), the standard list screen (D81):
	 * the search on the header line and the table below it. A row opens the
	 * user's sheet, addressed by `?user=` so a refresh keeps it (UI-8) and a
	 * workspace's member list can link to it.
	 *
	 * Disable and enable (US-082) are form actions on this page, each
	 * confirmed first; the sheet and the list reload with the new state.
	 */
	import { untrack } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { navigating, page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { ConsoleUserSheet, ConsoleUsersDataTable } from '$lib/components/organisms/console';
	import { readSort, sortParams, userActions, type UserAction } from '$lib/console';
	import { messageForCode } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { ConsoleUserRow } from '$lib/server/console';
	import { reloading, writeParams } from '$lib/url-state';

	let { data } = $props();

	const loaded = $derived({ rows: data.users, page: data.meta.page ?? 1, key: data.filterKey });
	const held = pagedRows<ConsoleUserRow>(untrack(() => loaded));
	$effect(() => {
		const next = loaded;
		untrack(() => held.update(next));
	});
	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	const sort = $derived(readSort(page.url));
	const bar = filterBar({}, { resetPage: true });

	const openUser = (user: ConsoleUserRow) => writeParams({ user: user.id }, { push: true });
	const closeUser = () => writeParams({ user: null }, { push: true });

	// ------------------------------------------------------------ actions

	const offered = $derived(data.open ? userActions(data.open, data.operator.permissions) : []);
	/** The action waiting on its confirmation, then on its answer. */
	let chosen = $state<UserAction | null>(null);
	let confirmOpen = $state(false);
	let busy = $state<UserAction | null>(null);
	let actionForm = $state<HTMLFormElement | null>(null);

	function ask(action: UserAction) {
		chosen = action;
		confirmOpen = true;
	}

	const submitAction: SubmitFunction = () => {
		const action = chosen;
		busy = action;
		return async ({ result, update }) => {
			busy = null;
			// A refusal here has no form to show fields beside: say it in a toast.
			if (result.type === 'failure') {
				toast.error(messageForCode(String(result.data?.code ?? '')));
				return;
			}
			if (result.type === 'success' && action) toast.success(t(`console.actions.${action}.done` as const));
			await update({ navigate: false });
		};
	};
</script>

<svelte:head><title>{pageTitle(t('console.nav_users'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_users')}</h1>

	<div class="flex shrink-0 items-center">
		<DataTableFilter
			bind:filters={bar.filters}
			placeholder={t('console.users.search_placeholder')}
			showAmount={false}
			showDate={false}
			class="w-full"
		/>
	</div>

	<ConsoleUsersDataTable
		loading={reloading(['search', 'sort', 'order'])}
		class="min-h-0 flex-1"
		users={held.rows}
		{sort}
		onSortChange={(next) => writeParams(sortParams(next))}
		filtered={data.filtered}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		onClear={() => writeParams({ search: null, page: null })}
		onOpenRow={openUser}
	/>
</div>

<ConsoleUserSheet
	open={data.open !== null}
	onOpenChange={(open) => {
		if (!open) closeUser();
	}}
	user={data.open}
	actions={offered}
	{busy}
	onAction={ask}
/>

<form
	bind:this={actionForm}
	method="POST"
	action="?/{chosen ?? ''}"
	class="hidden"
	use:enhance={submitAction}
>
	<input type="hidden" name="id" value={data.open?.id ?? ''} />
</form>

{#if chosen}
	<ConfirmDialog
		bind:open={confirmOpen}
		title={t(`console.actions.${chosen}.title` as const)}
		description={t(`console.actions.${chosen}.description` as const)}
		confirmLabel={t(`console.actions.${chosen}.button` as const)}
		cancelLabel={t('common.cancel')}
		onConfirm={() => actionForm?.requestSubmit()}
	/>
{/if}
