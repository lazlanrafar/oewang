<script lang="ts">
	/**
	 * The console's user table (CSL-3, US-081): the shared `DataTable` with
	 * its own columns (D81). A row opens the user's sheet. Read only: the
	 * write actions arrive with US-082.
	 */
	import X from '@lucide/svelte/icons/x';

	import { Badge } from '$lib/components/atoms/badge';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { formatCount, formatDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleUserRow } from '$lib/server/console';

	import { CONSOLE_USER_COLUMNS } from './console-users-data-table-column';

	let {
		users,
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
		users: ConsoleUserRow[];
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
		/** Decides which of the two empty states shows. */
		filtered?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		onClear?: () => void;
		onOpenRow?: (user: ConsoleUserRow) => void;
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		email: t('console.users.columns.email'),
		name: t('console.users.columns.name'),
		workspaces: t('console.users.columns.workspaces'),
		console_role: t('console.users.columns.console_role'),
		created_at: t('console.users.columns.joined'),
		last_active_at: t('console.users.columns.last_active')
	};
</script>

<DataTable
	{loading}
	class={className}
	columns={CONSOLE_USER_COLUMNS}
	rows={users}
	label={t('console.nav_users')}
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

	{#snippet cell(column, user)}
		{#if column.key === 'email'}
			<span class="flex min-w-0 items-center gap-2 px-4">
				<span class="truncate font-medium">{user.email}</span>
				{#if user.disabled_at}<Badge variant="destructive">{t('console.users.disabled')}</Badge>{/if}
			</span>
		{:else if column.key === 'name'}
			<span class="text-muted-foreground truncate px-4">{user.name ?? '—'}</span>
		{:else if column.key === 'workspaces'}
			<span class="px-4 tabular-nums">{formatCount(user.workspaces)}</span>
		{:else if column.key === 'console_role'}
			<span class="px-4">
				{#if user.console_role}<Badge variant="outline">{user.console_role}</Badge>{/if}
			</span>
		{:else if column.key === 'created_at'}
			<span class="text-muted-foreground truncate px-4 tabular-nums">{formatDay(user.created_at)}</span>
		{:else if column.key === 'last_active_at'}
			<span class="text-muted-foreground truncate px-4 tabular-nums">
				{user.last_active_at ? formatDay(user.last_active_at) : t('console.never')}
			</span>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('console.users.empty_filtered.title')}
				description={t('console.users.empty_filtered.description')}
				actionLabel={t('console.users.empty_filtered.action')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('console.users.empty.title')}
				description={t('console.users.empty.description')}
			/>
		{/if}
	{/snippet}
</DataTable>
