<script lang="ts">
	/**
	 * The debt table: the shared `DataTable` molecule, configured with the
	 * old page's columns (DEBT-11, D81).
	 *
	 * Ported from the old app's debts-columns. Each figure is the API's
	 * decimal string, printed by `formatMoney` and never parsed (D12). A row
	 * past its due date for the reader's own calendar carries the old red
	 * date. It holds no data and fetches nothing (D5); the selection is the
	 * page's, because the bulk bar acts on it.
	 */
	import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash';
	import X from '@lucide/svelte/icons/x';

	import { Badge, type BadgeVariant } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { isOverdue, isPartlyPaid } from '$lib/debts';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { Debt } from '$lib/server/debts';
	import { cn } from '$lib/utils';

	import { DEBT_COLUMNS } from './debts-data-table-column';

	let {
		debts,
		today,
		sort,
		onSortChange,
		selection = $bindable([]),
		canEdit = true,
		filtered = false,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		onAdd,
		onClear,
		onOpenRow,
		onOpenContact,
		onEditRow,
		onDeleteRow,
		loading = false,
		class: className
	}: {
		debts: Debt[];
		/** The reader's own date, for the overdue mark. */
		today: string;
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
		/** The ids ticked, for the bulk bar. */
		selection?: string[];
		canEdit?: boolean;
		/** Decides which of the two empty states shows (UI-2). */
		filtered?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		onAdd?: () => void;
		onClear?: () => void;
		onOpenRow?: (debt: Debt) => void;
		onOpenContact?: (contactId: string) => void;
		onEditRow?: (debt: Debt) => void;
		onDeleteRow?: (debt: Debt) => void;
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		contact: t('debts.columns.contact'),
		type: t('debts.columns.type'),
		description: t('debts.columns.description'),
		remaining: t('debts.columns.summary'),
		status: t('debts.columns.status'),
		due_date: t('debts.columns.due_date')
	};

	const STATUS_VARIANT: Record<Debt['status'], BadgeVariant> = {
		paid: 'default',
		partial: 'secondary',
		unpaid: 'outline'
	};

	const STATUS_LABEL: Record<Debt['status'], string> = {
		paid: t('debts.statuses.paid'),
		partial: t('debts.statuses.partial'),
		unpaid: t('debts.statuses.unpaid')
	};

	const columns = $derived(canEdit ? DEBT_COLUMNS : DEBT_COLUMNS.filter((c) => c.key !== 'select'));

	/* Ticks that no longer name a row on screen are dropped, so the bar never counts ghosts. */
	const shown = $derived(new Set(debts.map((debt) => debt.id)));
	const ticked = $derived(selection.filter((id) => shown.has(id)));
	const allTicked = $derived(debts.length > 0 && ticked.length === debts.length);

	function tick(id: string, on: boolean) {
		selection = on ? [...ticked, id] : ticked.filter((other) => other !== id);
	}

	const dueFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dueLabel = (day: string) => dueFormat.format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
</script>

<DataTable
	{loading}
	class={className}
	{columns}
	rows={debts}
	label={t('nav.debts')}
	{hasMore}
	{loadingMore}
	{onLoadMore}
	onRowClick={onOpenRow}
	rowClass={(row) => (ticked.includes(row.id) ? 'bg-row-hover' : undefined)}
>
	{#snippet head(column)}
		{#if column.key === 'select'}
			<div class="flex h-full w-full items-center justify-center">
				<Checkbox
					checked={allTicked}
					indeterminate={ticked.length > 0 && !allTicked}
					onCheckedChange={(checked) => (selection = checked === true ? debts.map((d) => d.id) : [])}
					aria-label={t('debts.columns.select_all')}
				/>
			</div>
		{:else if column.key === 'actions'}
			<span class="sr-only">{t('debts.columns.actions')}</span>
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

	{#snippet cell(column, debt)}
		{#if column.key === 'select'}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="flex h-full w-full items-center justify-center"
				onclick={(event) => event.stopPropagation()}
			>
				<Checkbox
					checked={ticked.includes(debt.id)}
					onCheckedChange={(checked) => tick(debt.id, checked === true)}
					aria-label={t('debts.columns.select_row', { name: debt.contact_name })}
				/>
			</div>
		{:else if column.key === 'type'}
			<div class="flex items-center gap-2 px-4">
				{#if debt.type === 'receivable'}
					<div
						class="flex h-6 w-6 items-center justify-center rounded-sm bg-emerald-500/10 text-emerald-500"
					>
						<ArrowDownLeft class="h-4 w-4" />
					</div>
				{:else}
					<div class="flex h-6 w-6 items-center justify-center rounded-sm bg-rose-500/10 text-rose-500">
						<ArrowUpRight class="h-4 w-4" />
					</div>
				{/if}
				<span class="hidden text-sm capitalize sm:inline-block">
					{t(debt.type === 'receivable' ? 'debts.types.receivable' : 'debts.types.payable')}
				</span>
			</div>
		{:else if column.key === 'contact'}
			<span class="truncate px-4">
				<button
					type="button"
					class="cursor-pointer text-sm font-medium hover:underline"
					onclick={(event) => {
						event.stopPropagation();
						onOpenContact?.(debt.contact_id);
					}}
				>
					{debt.contact_name}
				</button>
			</span>
		{:else if column.key === 'description'}
			<span class="text-foreground/80 block max-w-[200px] truncate px-4 text-left text-sm">
				{debt.description || debt.source_transaction_name || '-'}
			</span>
		{:else if column.key === 'remaining'}
			<div class="flex flex-col gap-1 px-4 text-right sm:text-left">
				<span class="text-sm font-medium tabular-nums">
					{formatMoney(debt.remaining_amount, debt.currency_code)}
				</span>
				{#if debt.status !== 'unpaid' && (isPartlyPaid(debt) || debt.status === 'paid')}
					<span class="text-muted-foreground text-xs line-through">
						{formatMoney(debt.amount, debt.currency_code)}
					</span>
				{/if}
			</div>
		{:else if column.key === 'status'}
			<span class="px-4">
				<Badge variant={STATUS_VARIANT[debt.status]}>{STATUS_LABEL[debt.status]}</Badge>
			</span>
		{:else if column.key === 'due_date'}
			{#if debt.due_date}
				<span class={cn('px-4 text-sm', isOverdue(debt, today) && 'text-destructive')}>
					{dueLabel(debt.due_date)}
				</span>
			{:else}
				<span class="text-muted-foreground px-4 text-sm">-</span>
			{/if}
		{:else if column.key === 'actions'}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class="flex h-full w-full items-center justify-center"
				onclick={(event) => event.stopPropagation()}
			>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8" {...props}>
								<span class="sr-only">{t('debts.actions.open_menu')}</span>
								<Ellipsis class="h-4 w-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-48">
						<DropdownMenu.Item class="gap-2" onclick={() => onOpenRow?.(debt)}>
							<ExternalLink class="h-4 w-4" />
							{t('debts.actions.view_details')}
						</DropdownMenu.Item>
						{#if canEdit}
							<DropdownMenu.Item class="gap-2" onclick={() => onEditRow?.(debt)}>
								<Pencil class="h-4 w-4" />
								{t('debts.actions.edit')}
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item class="text-destructive gap-2" onclick={() => onDeleteRow?.(debt)}>
								<Trash class="h-4 w-4" />
								{t('debts.actions.delete')}
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('debts.empty_filtered.title')}
				description={t('debts.empty_filtered.description')}
				actionLabel={t('debts.empty_filtered.action')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('debts.empty.title')}
				description={t('debts.empty.description')}
				actionLabel={canEdit ? t('debts.empty.action') : undefined}
				onAction={onAdd}
			/>
		{/if}
	{/snippet}
</DataTable>
