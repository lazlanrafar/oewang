<script lang="ts">
	/**
	 * The console's plans (PLN-1, OEW-131): the shared `DataTable` with its
	 * own columns (D81). A row opens the plan's sheet. The system plan's
	 * menu has no Delete: the API refuses deleting it.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { featureLabel, formatCount } from '$lib/console';
	import { formatBytes } from '$lib/files';
	import { t } from '$lib/i18n';
	import type { ConsolePlan } from '$lib/server/console';

	import { CONSOLE_PLAN_COLUMNS } from './console-plans-data-table-column';

	let {
		plans,
		canManage = false,
		filtered = false,
		onClear,
		onOpenRow,
		onEditRow,
		onDeleteRow,
		loading = false,
		class: className
	}: {
		plans: ConsolePlan[];
		canManage?: boolean;
		/** Decides which of the two empty states shows. */
		filtered?: boolean;
		onClear?: () => void;
		onOpenRow?: (plan: ConsolePlan) => void;
		onEditRow?: (plan: ConsolePlan) => void;
		onDeleteRow?: (plan: ConsolePlan) => void;
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		name: t('console.plans.columns.name'),
		tokens: t('console.plans.columns.tokens'),
		storage: t('console.plans.columns.storage'),
		features: t('console.plans.columns.features'),
		workspaces: t('console.plans.columns.workspaces')
	};

	/** The API's order, system plan first; the heads are labels, not sort buttons. */
	const UNSORTED: TableSort = { key: null, descending: false };

	const featureName = (feature: string) => {
		const key = featureLabel(feature);
		return key ? t(key) : feature;
	};
</script>

<DataTable
	{loading}
	class={className}
	columns={CONSOLE_PLAN_COLUMNS}
	rows={plans}
	label={t('console.nav_plans')}
	onRowClick={onOpenRow}
>
	{#snippet head(column)}
		{#if column.key === 'actions'}
			<span class="sr-only">{t('console.plans.columns.actions')}</span>
		{:else}
			<DataTableSortHead key={column.key} label={LABEL[column.key] ?? column.label} sort={UNSORTED} onSortChange={() => {}} />
		{/if}
	{/snippet}

	{#snippet cell(column, plan)}
		{#if column.key === 'name'}
			<span class="flex min-w-0 items-center gap-2 px-4">
				<span class="truncate font-medium">{plan.name}</span>
				{#if plan.is_system}<Badge variant="muted">{t('console.plans.system')}</Badge>{/if}
			</span>
		{:else if column.key === 'tokens'}
			<span class="px-4 tabular-nums">
				{plan.max_tokens_month === null ? t('console.plans.unlimited') : formatCount(plan.max_tokens_month)}
			</span>
		{:else if column.key === 'storage'}
			<span class="px-4 tabular-nums">
				{plan.max_storage_bytes === null ? t('console.plans.unlimited') : formatBytes(plan.max_storage_bytes)}
			</span>
		{:else if column.key === 'features'}
			<span class="flex min-w-0 items-center gap-1 overflow-hidden px-4">
				{#each plan.features as feature (feature)}
					<Badge variant="outline">{featureName(feature)}</Badge>
				{/each}
			</span>
		{:else if column.key === 'workspaces'}
			<span class="px-4 tabular-nums">{formatCount(plan.workspaces)}</span>
		{:else if canManage}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="flex h-full w-full items-center justify-center" onclick={(event) => event.stopPropagation()}>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8" {...props}>
								<span class="sr-only">{t('console.plans.open_menu')}</span>
								<Ellipsis class="h-4 w-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => onEditRow?.(plan)}>
							<Pencil class="mr-2 h-4 w-4" />
							<span>{t('console.plans.edit')}</span>
						</DropdownMenu.Item>
						{#if !plan.is_system}
							<DropdownMenu.Item class="text-destructive" onclick={() => onDeleteRow?.(plan)}>
								<Trash2 class="mr-2 h-4 w-4" />
								<span>{t('console.plans.delete')}</span>
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
				title={t('console.plans.empty_filtered.title')}
				description={t('console.plans.empty_filtered.description')}
				actionLabel={t('console.plans.empty_filtered.action')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState title={t('console.plans.empty.title')} description={t('console.plans.empty.description')} />
		{/if}
	{/snippet}
</DataTable>
