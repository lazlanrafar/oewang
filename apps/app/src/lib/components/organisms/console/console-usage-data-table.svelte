<script lang="ts" module>
	export type UsageTableRow = { id: string; name: string; input: number; output: number; calls: number };
</script>

<script lang="ts">
	/**
	 * One of the usage page's tables (CSL-10, US-084): the shared
	 * `DataTable` (D81) with a name column and the month's input, output and
	 * calls. A workspace row opens that workspace's sheet.
	 */
	import { DataTable, DataTableSortHead, type TableSort } from '$lib/components/molecules/data-table';
	import { formatCount } from '$lib/console';
	import { t } from '$lib/i18n';

	import { CONSOLE_USAGE_COLUMNS } from './console-usage-data-table-column';

	let {
		dimension,
		rows,
		label,
		onOpenRow,
		class: className
	}: {
		dimension: keyof typeof CONSOLE_USAGE_COLUMNS;
		rows: UsageTableRow[];
		/** The table's accessible name, and what its first column is. */
		label: string;
		onOpenRow?: (row: UsageTableRow) => void;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		input: t('console.usage.columns.input'),
		output: t('console.usage.columns.output'),
		calls: t('console.usage.columns.calls')
	};

	const UNSORTED: TableSort = { key: null, descending: false };
</script>

<DataTable class={className} columns={CONSOLE_USAGE_COLUMNS[dimension]} {rows} {label} onRowClick={onOpenRow}>
	{#snippet head(column)}
		<DataTableSortHead key={column.key} label={column.key === 'name' ? label : (LABEL[column.key] ?? column.label)} sort={UNSORTED} onSortChange={() => {}} />
	{/snippet}

	{#snippet cell(column, row)}
		{#if column.key === 'name'}
			<span class="truncate px-4 font-medium">{row.name}</span>
		{:else}
			<span class="px-4 tabular-nums">{formatCount(row[column.key as 'input' | 'output' | 'calls'])}</span>
		{/if}
	{/snippet}
</DataTable>
