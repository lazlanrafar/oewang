<script lang="ts">
	/**
	 * The budget table: the shared `DataTable` molecule, configured with the
	 * old page's columns (BUD-2).
	 *
	 * Every figure is the API's, formatted with `formatMoney` and never
	 * parsed (D12, D27); the bar's width is the API's whole percentage. It
	 * holds no data and fetches nothing (D5).
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/atoms/button';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { Progress } from '$lib/components/atoms/progress';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { BudgetLine } from '$lib/reports';
	import { cn } from '$lib/utils';

	import { BUDGET_COLUMNS } from './budgets-data-table-column';
	import { BAR_TONE, FIGURE_TONE, TEXT_TONE, barValue } from '$lib/budgets';

	let {
		budgets,
		currency,
		sort,
		onSortChange,
		canEdit = true,
		filtered = false,
		onAdd,
		onClear,
		onEditRow,
		onDeleteRow,
		loading = false,
		class: className
	}: {
		budgets: BudgetLine[];
		/** The workspace currency every figure is in. */
		currency: string;
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
		canEdit?: boolean;
		/** Decides which of the two empty states shows (UI-2). */
		filtered?: boolean;
		onAdd?: () => void;
		onClear?: () => void;
		onEditRow?: (budget: BudgetLine) => void;
		onDeleteRow?: (budget: BudgetLine) => void;
		/** Rows are on their way: the table draws its skeleton (D108). */
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		category: t('budget.col_category'),
		amount: t('budget.col_amount'),
		spent: t('budget.col_spent'),
		remaining: t('budget.col_remaining'),
		percent: t('budget.col_percent')
	};

	const negative = (value: string) => value.trim().startsWith('-');
</script>

<DataTable
	{loading}
	class={className}
	columns={BUDGET_COLUMNS}
	rows={budgets}
	label={t('nav.budget')}
	onRowClick={canEdit ? onEditRow : undefined}
>
	{#snippet head(column)}
		{#if column.key === 'actions'}
			<span class="sr-only">{t('common.actions')}</span>
		{:else}
			<DataTableSortHead
				key={column.key}
				label={LABEL[column.key] ?? column.label}
				sortable={column.sortable}
				{sort}
				{onSortChange}
			/>
		{/if}
	{/snippet}

	{#snippet cell(column, budget)}
		{#if column.key === 'category'}
			<span class="truncate px-4 font-medium">{budget.category_name}</span>
		{:else if column.key === 'amount'}
			<span class="px-4 font-medium tabular-nums">{formatMoney(budget.amount, currency)}</span>
		{:else if column.key === 'spent'}
			<span
				class={cn(
					'px-4 font-medium tabular-nums',
					budget.state === 'over' && FIGURE_TONE.over
				)}
			>
				{formatMoney(budget.spent, currency)}
			</span>
		{:else if column.key === 'remaining'}
			<span
				class={cn(
					'px-4 font-medium tabular-nums',
					negative(budget.remaining) ? 'text-destructive' : 'text-green'
				)}
			>
				{formatMoney(budget.remaining, currency)}
			</span>
		{:else if column.key === 'percent'}
			<span class="flex w-full items-center gap-3 px-4">
				<Progress
					class="bg-muted h-1.5 flex-1"
					indicatorClass={BAR_TONE[budget.state]}
					value={barValue(budget.percent)}
					aria-label={t('budget.used_aria', {
						name: budget.category_name,
						percent: budget.percent
					})}
				/>
				<span
					class={cn(
						'min-w-12 text-right text-xs font-medium tabular-nums',
						TEXT_TONE[budget.state]
					)}
				>
					{budget.percent}%
				</span>
			</span>
		{:else if canEdit}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="flex h-full w-full items-center justify-center"
				onclick={(event) => event.stopPropagation()}
			>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								variant="ghost"
								size="icon"
								class="size-7"
								aria-label={t('common.actions')}
								{...props}
							>
								<Ellipsis />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-48">
						<DropdownMenu.Item onclick={() => onEditRow?.(budget)}>
							{t('common.edit')}
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item class="text-destructive" onclick={() => onDeleteRow?.(budget)}>
							{t('common.delete')}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('budget.empty_filtered_title')}
				description={t('budget.empty_filtered_description')}
				actionLabel={t('budget.clear')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('budget.empty_title')}
				description={t('budget.empty_description')}
				actionLabel={canEdit ? t('budget.create') : undefined}
				onAction={onAdd}
			/>
		{/if}
	{/snippet}
</DataTable>
