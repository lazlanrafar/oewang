<script lang="ts">
	/**
	 * The console's workspace table (CSL-4, US-081): the shared `DataTable`
	 * with its own columns (D81). A row opens the workspace's sheet. Read
	 * only: suspend and restore arrive with US-082.
	 */
	import X from '@lucide/svelte/icons/x';

	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { formatCount, formatDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleWorkspaceRow } from '$lib/server/console';

	import ConsoleWorkspaceStatusBadge from './console-workspace-status-badge.svelte';
	import { CONSOLE_WORKSPACE_COLUMNS } from './console-workspaces-data-table-column';

	let {
		workspaces,
		sort,
		onSortChange,
		filtered = false,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		onClear,
		onOpenRow,
		loading = false,
		class: className
	}: {
		workspaces: ConsoleWorkspaceRow[];
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
		/** Decides which of the two empty states shows. */
		filtered?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		onClear?: () => void;
		onOpenRow?: (workspace: ConsoleWorkspaceRow) => void;
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		name: t('console.workspaces.columns.name'),
		owner_email: t('console.workspaces.columns.owner'),
		members: t('console.workspaces.columns.members'),
		plan: t('console.workspaces.columns.plan'),
		status: t('console.workspaces.columns.status'),
		created_at: t('console.workspaces.columns.created'),
		last_activity_at: t('console.workspaces.columns.last_activity')
	};
</script>

<DataTable
	{loading}
	class={className}
	columns={CONSOLE_WORKSPACE_COLUMNS}
	rows={workspaces}
	label={t('console.nav_workspaces')}
	{hasMore}
	{loadingMore}
	{onLoadMore}
	onRowClick={onOpenRow}
>
	{#snippet head(column)}
		<DataTableSortHead
			key={column.key}
			label={LABEL[column.key] ?? column.label}
			sortable={column.sortable}
			{sort}
			{onSortChange}
		/>
	{/snippet}

	{#snippet cell(column, workspace)}
		{#if column.key === 'name'}
			<span class="truncate px-4 font-medium">{workspace.name}</span>
		{:else if column.key === 'owner_email'}
			<span class="text-muted-foreground truncate px-4">{workspace.owner_email ?? '—'}</span>
		{:else if column.key === 'members'}
			<span class="px-4 tabular-nums">{formatCount(workspace.members)}</span>
		{:else if column.key === 'plan'}
			<span class="truncate px-4">{workspace.plan_name}</span>
		{:else if column.key === 'status'}
			<span class="px-4"><ConsoleWorkspaceStatusBadge {workspace} /></span>
		{:else if column.key === 'created_at'}
			<span class="text-muted-foreground truncate px-4 tabular-nums">{formatDay(workspace.created_at)}</span>
		{:else if column.key === 'last_activity_at'}
			<span class="text-muted-foreground truncate px-4 tabular-nums">
				{workspace.last_activity_at ? formatDay(workspace.last_activity_at) : t('console.never')}
			</span>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('console.workspaces.empty_filtered.title')}
				description={t('console.workspaces.empty_filtered.description')}
				actionLabel={t('console.workspaces.empty_filtered.action')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('console.workspaces.empty.title')}
				description={t('console.workspaces.empty.description')}
			/>
		{/if}
	{/snippet}
</DataTable>
