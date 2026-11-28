<script lang="ts">
	/**
	 * The console's workspaces (CSL-4, US-081), the standard list screen
	 * (D81): the search and the status facet on the header line and the
	 * table below it. A row opens the workspace's sheet, addressed by
	 * `?workspace=` so a refresh keeps it (UI-8) and a user's membership
	 * list can link to it.
	 *
	 * Suspend, unsuspend and restore (US-082) are form actions on this
	 * page, each confirmed first; the sheet and the list reload with the
	 * new state.
	 */
	import { untrack } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { navigating, page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { ConsoleWorkspaceSheet, ConsoleWorkspacesDataTable } from '$lib/components/organisms/console';
	import { readSort, sortParams, workspaceActions, type WorkspaceAction } from '$lib/console';
	import { messageForCode } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { ConsoleWorkspaceRow } from '$lib/server/console';
	import { reloading, writeParams } from '$lib/url-state';

	let { data } = $props();

	const loaded = $derived({ rows: data.workspaces, page: data.meta.page ?? 1, key: data.filterKey });
	const held = pagedRows<ConsoleWorkspaceRow>(untrack(() => loaded));
	$effect(() => {
		const next = loaded;
		untrack(() => held.update(next));
	});
	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	const sort = $derived(readSort(page.url));
	const bar = filterBar({ status: 'status' }, { resetPage: true });

	const STATUS_OPTIONS = [
		{ id: 'active', name: t('console.workspaces.status_active') },
		{ id: 'suspended', name: t('console.workspaces.status_suspended') },
		{ id: 'deleted', name: t('console.workspaces.status_deleted') }
	];

	const openWorkspace = (workspace: ConsoleWorkspaceRow) =>
		writeParams({ workspace: workspace.id }, { push: true });
	const closeWorkspace = () => writeParams({ workspace: null }, { push: true });

	// ------------------------------------------------------------ actions

	const offered = $derived(data.open ? workspaceActions(data.open, data.operator.permissions) : []);
	/** The action waiting on its confirmation, then on its answer. */
	let chosen = $state<WorkspaceAction | null>(null);
	let confirmOpen = $state(false);
	let busy = $state<WorkspaceAction | null>(null);
	let actionForm = $state<HTMLFormElement | null>(null);

	function ask(action: WorkspaceAction) {
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

	// --------------------------------------------------------------- plan

	let savingPlan = $state(false);
	const submitPlan: SubmitFunction = () => {
		savingPlan = true;
		return async ({ result, update }) => {
			savingPlan = false;
			if (result.type === 'failure') {
				toast.error(messageForCode(String(result.data?.code ?? '')));
				return;
			}
			if (result.type === 'success') toast.success(t('console.workspaces.plan_changed'));
			await update({ navigate: false });
		};
	};
	const planAction = (node: HTMLFormElement) => enhance(node, submitPlan);
</script>

<svelte:head><title>{pageTitle(t('console.nav_workspaces'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_workspaces')}</h1>

	<div class="flex shrink-0 items-center">
		<DataTableFilter
			bind:filters={bar.filters}
			facets={[
				{ id: 'status', label: t('console.workspaces.status_label'), options: STATUS_OPTIONS, multiple: false }
			]}
			placeholder={t('console.workspaces.search_placeholder')}
			showAmount={false}
			showDate={false}
			class="w-full"
		/>
	</div>

	<ConsoleWorkspacesDataTable
		loading={reloading(['search', 'status', 'sort', 'order'])}
		class="min-h-0 flex-1"
		workspaces={held.rows}
		{sort}
		onSortChange={(next) => writeParams(sortParams(next))}
		filtered={data.filtered}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		onClear={() => writeParams({ search: null, status: null, page: null })}
		onOpenRow={openWorkspace}
	/>
</div>

<ConsoleWorkspaceSheet
	open={data.open !== null}
	onOpenChange={(open) => {
		if (!open) closeWorkspace();
	}}
	workspace={data.open}
	actions={offered}
	{busy}
	onAction={ask}
	plans={data.plans}
	{savingPlan}
	planEnhance={planAction}
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
