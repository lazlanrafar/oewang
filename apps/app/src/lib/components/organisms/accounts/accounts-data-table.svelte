<script lang="ts">
	/**
	 * The accounts table: the shared `DataTable` molecule, configured.
	 *
	 * Everything structural, the scrollport, the sticky header, the widths
	 * and the ARIA, belongs to the molecule, so this screen and the
	 * transactions list cannot drift apart on geometry. What is here is the
	 * only part that is actually about accounts: which columns, and what a
	 * cell renders.
	 *
	 * It holds no data and fetches nothing (D5). Rows arrive as a prop,
	 * already ordered by the API, and every balance is a decimal string
	 * formatted by `formatMoney` (D12).
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Star from '@lucide/svelte/icons/star';

	import { Button } from '$lib/components/atoms/button';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { DataTable, DataTableEmptyState } from '$lib/components/molecules/data-table';
	import { SelectGroup, UNGROUPED } from '$lib/components/molecules/select-group';
	import { t } from '$lib/i18n';
	import { workspaceLists } from '$lib/workspace-data.svelte';
	import { formatMoney } from '$lib/money';
	import type { Wallet } from '$lib/server/ledger';

	import { ACCOUNT_COLUMNS } from './accounts-data-table-column';

	let {
		accounts,
		groups,
		canEdit = true,
		locale = 'en-GB',
		emptyTitle,
		emptyDescription,
		emptyActionLabel,
		onAdd,
		onOpenRow,
		onEditRow,
		onDeleteRow,
		onSetDefault,
		onGroupChange,
		createLabel,
		class: className
	}: {
		accounts: Wallet[];
		/** Omitted, the workspace's own groups, as the picker reads them. */
		groups?: Array<{ id: string; name: string }>;
		canEdit?: boolean;
		locale?: string;
		emptyTitle: string;
		emptyDescription: string;
		emptyActionLabel?: string;
		onAdd?: () => void;
		onOpenRow?: (account: Wallet) => void;
		onEditRow?: (account: Wallet) => void;
		onDeleteRow?: (account: Wallet) => void;
		onSetDefault?: (account: Wallet) => void;
		onGroupChange?: (account: Wallet, groupId: string) => void;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		class?: string;
	} = $props();

	const dateFormatter = $derived(
		new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
	);

	const created = (value: string) => {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
	};

	const lists = workspaceLists();
	const groupList = $derived(groups ?? lists.groups);

	const groupName = (account: Wallet) =>
		account.group_name ?? groupList.find((group) => group.id === account.group_id)?.name ?? '';
</script>

<DataTable
	class={className}
	columns={ACCOUNT_COLUMNS}
	rows={accounts}
	label={t('accounts.title')}
	onRowClick={onOpenRow}
>
	{#snippet head(column)}
		{#if column.key === 'actions'}
			<span class="sr-only">{t('common.actions')}</span>
		{:else}
			<span class="truncate">{t(`accounts.col_${column.key}` as 'accounts.col_name')}</span>
		{/if}
	{/snippet}

	{#snippet cell(column, account)}
		{#if column.key === 'name'}
			<span class="flex min-w-0 items-center gap-1.5 px-4 font-medium">
				<span class="truncate">{account.name}</span>
				{#if account.is_default}
					<Star
						class="size-3.5 shrink-0 fill-amber-400 text-amber-400"
						aria-label={t('accounts.default_badge')}
					/>
				{/if}
			</span>
		{:else if column.key === 'group'}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div class="h-full w-full" onclick={(event) => event.stopPropagation()}>
				{#if canEdit}
					<!--
						The design system's picker, never a native `<select>`: its
						options come from the workspace, and a native drop-down is
						drawn by the operating system, so it arrives in the wrong
						type at the wrong size with a tick nobody chose (D79).
					-->
					<!--
						No list and no create handler passed: the picker reads the
						workspace's own groups and makes one there if a name is
						typed that nobody has used (D80). Creating selects it,
						which arrives here as an ordinary change.
					-->
					<SelectGroup
						{groups}
						creatable={canEdit}
						value={account.group_id ?? UNGROUPED}
						ariaLabel={t('accounts.col_group')}
						ungroupedLabel={t('accounts.ungrouped')}
						placeholder={t('accounts.group_placeholder')}
						searchPlaceholder={t('accounts.search_groups')}
						createLabel={createLabel}
						inDataTable
						onChange={(value) => onGroupChange?.(account, value === UNGROUPED ? '' : value)}
					/>
				{:else}
					<span class="text-subtle flex h-full items-center truncate px-3">
						{groupName(account)}
					</span>
				{/if}
			</div>
		{:else if column.key === 'balance'}
			<!-- In the account's own currency, at that currency's own precision
			     (WAL-2). A total is the workspace's; a balance is never
			     converted on the way to a row. -->
			<span class="px-4 font-medium tabular-nums">
				{formatMoney(account.balance, account.currency_code)}
			</span>
		{:else if column.key === 'created'}
			<span class="text-subtle truncate px-4">{created(account.created_at)}</span>
		{:else}
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
						<DropdownMenu.Item onclick={() => onOpenRow?.(account)}>
							{t('common.view')}
						</DropdownMenu.Item>
						{#if canEdit}
							<DropdownMenu.Item onclick={() => onEditRow?.(account)}>
								{t('common.edit')}
							</DropdownMenu.Item>
							{#if !account.is_default}
								<DropdownMenu.Item onclick={() => onSetDefault?.(account)}>
									{t('accounts.make_default')}
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item class="text-destructive" onclick={() => onDeleteRow?.(account)}>
								{t('common.delete')}
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
	{/snippet}

	{#snippet empty()}
		<DataTableEmptyState
			title={emptyTitle}
			description={emptyDescription}
			actionLabel={canEdit ? emptyActionLabel : undefined}
			onAction={onAdd}
		/>
	{/snippet}
</DataTable>
