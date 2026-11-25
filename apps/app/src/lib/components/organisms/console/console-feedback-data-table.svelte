<script lang="ts">
	/**
	 * The console's feedback inbox (CSL-8, US-083): the shared `DataTable`
	 * with its own columns (D81). A row opens the feedback's sheet.
	 */
	import X from '@lucide/svelte/icons/x';

	import { Badge } from '$lib/components/atoms/badge';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { formatDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleFeedback } from '$lib/server/console';

	import { CONSOLE_FEEDBACK_COLUMNS } from './console-feedback-data-table-column';
	import { FEEDBACK_STATUS_LABEL, FEEDBACK_TYPE_LABEL } from './console-feedback-labels';

	let {
		feedback,
		filtered = false,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		onClear,
		onOpenRow,
		loading = false,
		class: className
	}: {
		feedback: ConsoleFeedback[];
		/** Decides which of the two empty states shows. */
		filtered?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		onClear?: () => void;
		onOpenRow?: (item: ConsoleFeedback) => void;
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		message: t('console.feedback.columns.message'),
		type: t('console.feedback.columns.type'),
		user_email: t('console.feedback.columns.from'),
		workspace_name: t('console.feedback.columns.workspace'),
		status: t('console.feedback.columns.status'),
		created_at: t('console.feedback.columns.received')
	};

	/** Newest first is the only order; the heads are labels, not sort buttons. */
	const NEWEST: TableSort = { key: 'created_at', descending: true };
</script>

<DataTable
	{loading}
	class={className}
	columns={CONSOLE_FEEDBACK_COLUMNS}
	rows={feedback}
	label={t('console.nav_feedback')}
	{hasMore}
	{loadingMore}
	{onLoadMore}
	onRowClick={onOpenRow}
>
	{#snippet head(column)}
		<DataTableSortHead key={column.key} label={LABEL[column.key] ?? column.label} sort={NEWEST} onSortChange={() => {}} />
	{/snippet}

	{#snippet cell(column, item)}
		{#if column.key === 'message'}
			<span class="truncate px-4 font-medium">{item.message}</span>
		{:else if column.key === 'type'}
			<span class="px-4"><Badge variant="outline">{FEEDBACK_TYPE_LABEL[item.type]}</Badge></span>
		{:else if column.key === 'user_email'}
			<span class="text-muted-foreground truncate px-4">{item.user_email}</span>
		{:else if column.key === 'workspace_name'}
			<span class="text-muted-foreground truncate px-4">{item.workspace_name}</span>
		{:else if column.key === 'status'}
			<span class="px-4">
				<Badge variant={item.status === 'open' ? 'secondary' : 'muted'}>{FEEDBACK_STATUS_LABEL[item.status]}</Badge>
			</span>
		{:else if column.key === 'created_at'}
			<span class="text-muted-foreground truncate px-4 tabular-nums">{formatDay(item.created_at)}</span>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('console.feedback.empty_filtered.title')}
				description={t('console.feedback.empty_filtered.description')}
				actionLabel={t('console.feedback.empty_filtered.action')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('console.feedback.empty.title')}
				description={t('console.feedback.empty.description')}
			/>
		{/if}
	{/snippet}
</DataTable>
