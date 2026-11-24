<script lang="ts">
	/**
	 * The contact table: the shared `DataTable`, configured with the old
	 * page's columns (CON-2, D81). Ported from the old app's
	 * contact-columns; a row opens the contact's sheet.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Merge from '@lucide/svelte/icons/merge';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '$lib/components/atoms/button';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import {
		DataTable,
		DataTableEmptyState,
		DataTableSortHead,
		type TableSort
	} from '$lib/components/molecules/data-table';
	import { t } from '$lib/i18n';
	import type { Contact } from '$lib/server/contacts';

	import { CONTACT_COLUMNS } from './contacts-data-table-column';

	let {
		contacts,
		sort,
		onSortChange,
		canEdit = true,
		filtered = false,
		hasMore = false,
		loadingMore = false,
		onLoadMore,
		onAdd,
		onClear,
		onOpenRow,
		onEditRow,
		onMergeRow,
		onDeleteRow,
		loading = false,
		class: className
	}: {
		contacts: Contact[];
		sort: TableSort;
		onSortChange: (next: TableSort) => void;
		canEdit?: boolean;
		filtered?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		onLoadMore?: () => void;
		onAdd?: () => void;
		onClear?: () => void;
		onOpenRow?: (contact: Contact) => void;
		onEditRow?: (contact: Contact) => void;
		onMergeRow?: (contact: Contact) => void;
		onDeleteRow?: (contact: Contact) => void;
		loading?: boolean;
		class?: string;
	} = $props();

	const LABEL: Record<string, string> = {
		name: t('contacts.columns.name'),
		email: t('contacts.columns.email'),
		phone: t('contacts.columns.phone')
	};
</script>

<DataTable
	{loading}
	class={className}
	columns={CONTACT_COLUMNS}
	rows={contacts}
	label={t('nav.contacts')}
	{hasMore}
	{loadingMore}
	{onLoadMore}
	onRowClick={onOpenRow}
>
	{#snippet head(column)}
		{#if column.key === 'actions'}
			<span class="sr-only">{t('contacts.columns.actions')}</span>
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

	{#snippet cell(column, contact)}
		{#if column.key === 'name'}
			<span class="truncate px-4 font-medium">{contact.name}</span>
		{:else if column.key === 'email'}
			<span class="truncate px-4">
				{#if contact.email}
					<a
						href="mailto:{contact.email}"
						class="text-muted-foreground hover:text-foreground transition-colors"
						onclick={(event) => event.stopPropagation()}
					>
						{contact.email}
					</a>
				{/if}
			</span>
		{:else if column.key === 'phone'}
			<span class="text-muted-foreground truncate px-4">{contact.phone ?? '—'}</span>
		{:else if canEdit}
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
					<DropdownMenu.Content align="end">
						<DropdownMenu.Label>{t('contacts.details.title')}</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => onEditRow?.(contact)}>
							<Pencil class="mr-2 h-4 w-4" />
							<span>{t('contacts.details.edit_contact')}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => onMergeRow?.(contact)}>
							<Merge class="mr-2 h-4 w-4" />
							<span>{t('contacts.details.merge_contact')}</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item class="text-destructive" onclick={() => onDeleteRow?.(contact)}>
							<Trash2 class="mr-2 h-4 w-4" />
							<span>{t('contacts.details.delete_contact')}</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}

	{#snippet empty()}
		{#if filtered}
			<DataTableEmptyState
				title={t('contacts.empty_filtered.title')}
				description={t('contacts.empty_filtered.description')}
				actionLabel={t('contacts.empty_filtered.action')}
				icon={X}
				onAction={onClear}
			/>
		{:else}
			<DataTableEmptyState
				title={t('contacts.empty.title')}
				description={t('contacts.empty.description')}
				actionLabel={canEdit ? t('contacts.empty.action') : undefined}
				onAction={onAdd}
			/>
		{/if}
	{/snippet}
</DataTable>
