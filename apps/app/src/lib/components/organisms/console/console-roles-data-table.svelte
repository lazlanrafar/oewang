<script lang="ts">
	/**
	 * The console's roles (CSL-2, US-085): the shared `DataTable` with its
	 * own columns (D81). A row opens the role's sheet. The system role and
	 * the role the signed-in operator holds carry no menu: the API refuses
	 * changing either.
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
	import { formatCount, permissionLabel } from '$lib/console';
	import { t } from '$lib/i18n';
	import type { ConsoleRole } from '$lib/server/console';

	import { CONSOLE_ROLE_COLUMNS } from './console-roles-data-table-column';

	let {
		roles,
		ownRoleId,
		canManage = false,
		onOpenRow,
		onEditRow,
		onDeleteRow,
		class: className
	}: {
		roles: ConsoleRole[];
		/** The role the signed-in operator holds. */
		ownRoleId: string;
		canManage?: boolean;
		onOpenRow?: (role: ConsoleRole) => void;
		onEditRow?: (role: ConsoleRole) => void;
		onDeleteRow?: (role: ConsoleRole) => void;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		name: t('console.roles.columns.name'),
		description: t('console.roles.columns.description'),
		permissions: t('console.roles.columns.permissions'),
		operators: t('console.roles.columns.operators')
	};

	/** The API's order, system role first; the heads are labels, not sort buttons. */
	const UNSORTED: TableSort = { key: null, descending: false };

	const permissionName = (permission: string) => {
		const key = permissionLabel(permission);
		return key ? t(key) : permission;
	};
</script>

<DataTable class={className} columns={CONSOLE_ROLE_COLUMNS} rows={roles} label={t('console.nav_roles')} onRowClick={onOpenRow}>
	{#snippet head(column)}
		{#if column.key === 'actions'}
			<span class="sr-only">{t('console.roles.columns.actions')}</span>
		{:else}
			<DataTableSortHead key={column.key} label={LABEL[column.key] ?? column.label} sort={UNSORTED} onSortChange={() => {}} />
		{/if}
	{/snippet}

	{#snippet cell(column, role)}
		{#if column.key === 'name'}
			<span class="flex min-w-0 items-center gap-2 px-4">
				<span class="truncate font-medium">{role.name}</span>
				{#if role.is_system}<Badge variant="muted">{t('console.roles.system')}</Badge>{/if}
				{#if role.id === ownRoleId}<Badge variant="muted">{t('console.roles.yours')}</Badge>{/if}
			</span>
		{:else if column.key === 'description'}
			<span class="text-muted-foreground truncate px-4">{role.description ?? '—'}</span>
		{:else if column.key === 'permissions'}
			<span class="flex min-w-0 items-center gap-1 overflow-hidden px-4">
				{#each role.permissions as permission (permission)}
					<Badge variant="outline">{permissionName(permission)}</Badge>
				{/each}
			</span>
		{:else if column.key === 'operators'}
			<span class="px-4 tabular-nums">{formatCount(role.operators)}</span>
		{:else if canManage && !role.is_system && role.id !== ownRoleId}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="flex h-full w-full items-center justify-center" onclick={(event) => event.stopPropagation()}>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="ghost" size="icon" class="size-8" {...props}>
								<span class="sr-only">{t('console.roles.open_menu')}</span>
								<Ellipsis class="h-4 w-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => onEditRow?.(role)}>
							<Pencil class="mr-2 h-4 w-4" />
							<span>{t('console.roles.edit')}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item class="text-destructive" onclick={() => onDeleteRow?.(role)}>
							<Trash2 class="mr-2 h-4 w-4" />
							<span>{t('console.roles.delete')}</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}

	{#snippet empty()}
		<DataTableEmptyState title={t('console.roles.empty.title')} description={t('console.roles.empty.description')} />
	{/snippet}
</DataTable>
