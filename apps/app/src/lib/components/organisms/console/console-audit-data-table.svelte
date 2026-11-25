<script lang="ts">
	/**
	 * The operator audit (CSL-12, US-085): the shared `DataTable` with its
	 * own columns (D81), newest first with load-more paging. A row opens its
	 * before-and-after sheet; the changed thing links to its own screen.
	 */
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { auditEntityHref } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleAuditEntry } from '$lib/server/console';

	import { actionName, entityName, whenLabel } from './console-audit-labels';
	import { CONSOLE_AUDIT_COLUMNS } from './console-audit-data-table-column';

	let {
		entries,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		onOpenRow,
		class: className
	}: {
		entries: ConsoleAuditEntry[];
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		onOpenRow?: (entry: ConsoleAuditEntry) => void;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		created_at: t('console.audit.columns.when'),
		operator_email: t('console.audit.columns.operator'),
		action: t('console.audit.columns.action'),
		entity: t('console.audit.columns.entity')
	};

	/** Newest first is the only order; the heads are labels, not sort buttons. */
	const NEWEST: TableSort = { key: 'created_at', descending: true };
</script>

<DataTable
	class={className}
	columns={CONSOLE_AUDIT_COLUMNS}
	rows={entries}
	label={t('console.nav_audit')}
	{hasMore}
	{loadingMore}
	{onLoadMore}
	onRowClick={onOpenRow}
>
	{#snippet head(column)}
		<DataTableSortHead key={column.key} label={LABEL[column.key] ?? column.label} sort={NEWEST} onSortChange={() => {}} />
	{/snippet}

	{#snippet cell(column, entry)}
		{#if column.key === 'created_at'}
			<span class="truncate px-4 tabular-nums">{whenLabel(entry.created_at)}</span>
		{:else if column.key === 'operator_email'}
			<span class="text-muted-foreground truncate px-4">{entry.operator_email}</span>
		{:else if column.key === 'action'}
			<span class="truncate px-4 font-medium">{actionName(entry.action)}</span>
		{:else if column.key === 'entity'}
			{@const href = auditEntityHref(entry.entity, entry.entity_id)}
			<span class="truncate px-4">
				{#if href}
					<a class="hover:underline" {href} onclick={(event) => event.stopPropagation()}>{entityName(entry.entity)}</a>
				{:else}
					<span class="text-muted-foreground">{entityName(entry.entity)}</span>
				{/if}
			</span>
		{/if}
	{/snippet}

	{#snippet empty()}
		<DataTableEmptyState title={t('console.audit.empty.title')} description={t('console.audit.empty.description')} />
	{/snippet}
</DataTable>
