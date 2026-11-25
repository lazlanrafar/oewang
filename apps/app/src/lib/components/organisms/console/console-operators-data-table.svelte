<script lang="ts">
	/**
	 * The console's operators (CSL-2, US-085): the shared `DataTable` with
	 * its own columns (D81). The row menu changes the role or revokes it; the
	 * signed-in operator's own row has none, because the API refuses both.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { formatDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleOperator } from '$lib/server/console';

	import { CONSOLE_OPERATOR_COLUMNS } from './console-operators-data-table-column';

	let {
		operators,
		selfId,
		canManage = false,
		onChangeRow,
		onRevokeRow,
		class: className
	}: {
		operators: ConsoleOperator[];
		/** The signed-in operator, whose row carries no actions. */
		selfId: string;
		canManage?: boolean;
		onChangeRow?: (operator: ConsoleOperator) => void;
		onRevokeRow?: (operator: ConsoleOperator) => void;
		class?: string;
	} = $props();

	/** DataTable keys its rows by `id`; an operator is keyed by its user. */
	const rows = $derived(operators.map((operator) => ({ ...operator, id: operator.user_id })));

	const LABEL: Record<string, string> = {
		email: t('console.operators.columns.email'),
		name: t('console.operators.columns.name'),
		role: t('console.operators.columns.role'),
		last_active_at: t('console.operators.columns.last_active')
	};

	/** The API's order; the heads are labels, not sort buttons. */
	const UNSORTED: TableSort = { key: null, descending: false };
</script>

<DataTable class={className} columns={CONSOLE_OPERATOR_COLUMNS} {rows} label={t('console.nav_operators')}>
	{#snippet head(column)}
		{#if column.key === 'actions'}
			<span class="sr-only">{t('console.operators.columns.actions')}</span>
		{:else}
			<DataTableSortHead key={column.key} label={LABEL[column.key] ?? column.label} sort={UNSORTED} onSortChange={() => {}} />
		{/if}
	{/snippet}

	{#snippet cell(column, operator)}
		{#if column.key === 'email'}
			<span class="flex min-w-0 items-center gap-2 px-4">
				<span class="truncate font-medium">{operator.email}</span>
				{#if operator.user_id === selfId}<Badge variant="muted">{t('console.operators.you')}</Badge>{/if}
			</span>
		{:else if column.key === 'name'}
			<span class="text-muted-foreground truncate px-4">{operator.name ?? '—'}</span>
		{:else if column.key === 'role'}
			<span class="px-4"><Badge variant="outline">{operator.role_name}</Badge></span>
		{:else if column.key === 'last_active_at'}
			<span class="text-muted-foreground truncate px-4 tabular-nums">
				{operator.last_active_at ? formatDay(operator.last_active_at) : t('console.never')}
			</span>
		{:else if canManage && operator.user_id !== selfId}
			<div class="flex h-full w-full items-center justify-center">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8" {...props}>
								<span class="sr-only">{t('console.operators.open_menu')}</span>
								<Ellipsis class="h-4 w-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => onChangeRow?.(operator)}>
							<Pencil class="mr-2 h-4 w-4" />
							<span>{t('console.operators.change_role')}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item class="text-destructive" onclick={() => onRevokeRow?.(operator)}>
							<Trash2 class="mr-2 h-4 w-4" />
							<span>{t('console.operators.revoke')}</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}

	{#snippet empty()}
		<DataTableEmptyState
			title={t('console.operators.empty.title')}
			description={t('console.operators.empty.description')}
		/>
	{/snippet}
</DataTable>
