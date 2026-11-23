<script lang="ts">
	/**
	 * The accounts screen (WAL-1 to WAL-6).
	 *
	 * Three figures, a search, and the table. The page owns every wallet
	 * write: creating, renaming, grouping, setting the default and deleting
	 * all happen here, which is why Settings no longer carries them. Two
	 * screens managing one thing is how two rules drift apart.
	 *
	 * Every mutation is a form action, so the page works with JavaScript
	 * disabled and the list afterwards is what the server holds rather than
	 * what the browser guessed.
	 */
	import FolderCog from '@lucide/svelte/icons/folder-cog';
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';

	import { applyAction, deserialize, enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		AccountDetailSheet,
		AccountFormSheet,
		AccountGroupsSheet,
		AccountSummaryCards,
		AccountsDataTable
	} from '$lib/components/organisms/accounts';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { reloading } from '$lib/url-state';
	import { messageForCode } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import type { Wallet } from '$lib/server/ledger';

	let { data, form } = $props();

	const canEdit = $derived(data.me.role !== 'member');

	/**
	 * The search and the facets, in the URL so a filtered view can be shared
	 * (UI-8, D55). "Ungrouped" is the `none` group, which the load reads as
	 * the wallets in no group at all.
	 */
	const bar = filterBar({ group: 'group_id', currency: 'currency' });

	const groupOptions = $derived([
		...data.groups.map((group) => ({ id: group.id, name: group.name })),
		{ id: 'none', name: t('accounts.ungrouped') }
	]);
	const currencyOptions = $derived(data.currencies.map((code) => ({ id: code, name: code })));

	// ------------------------------------------------------------- sheets

	let formOpen = $state(false);
	let editing = $state<Wallet | null>(null);
	let detailOpen = $state(false);
	let detail = $state<Wallet | null>(null);
	let saving = $state(false);

	/** The row the detail sheet is on, re-read from the load so it stays fresh. */
	const detailAccount = $derived(
		detail ? (data.wallets.find((wallet) => wallet.id === detail?.id) ?? detail) : null
	);

	function openNew() {
		editing = null;
		formOpen = true;
	}

	function openEdit(account: Wallet) {
		editing = account;
		formOpen = true;
	}

	// ------------------------------------------------------------ deletes

	let confirmDelete = $state(false);
	let deleting = $state<Wallet | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);

	function askDelete(account: Wallet) {
		deleting = account;
		confirmDelete = true;
	}

	/**
	 * One field, posted from a cell or a menu.
	 *
	 * The cell has already drawn the new value, so a failure has to put the
	 * row back: `invalidateAll` reloads what the server actually holds,
	 * which is also what makes a success stick.
	 */
	async function post(action: string, fields: Record<string, string>, success: string) {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);

		saving = true;
		const response = await fetch(action, { method: 'POST', body });
		const result = deserialize(await response.text());
		saving = false;

		await invalidateAll();
		if (result.type === 'success') toast.success(success);
		else await applyAction(result);
		return result;
	}

	const toastOnSuccess: SubmitFunction = () => async ({ result, update }) => {
		if (result.type === 'success') toast.success(t('accounts.updated'));
		await update({ navigate: false });
	};

	const closeOnSuccess: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				formOpen = false;
				toast.success(editing ? t('accounts.updated') : t('accounts.created'));
			}
			await update({ navigate: false });
		};
	};

	/*
	 * The sheets take an action, not a submit function: they mount the form
	 * and the page decides what a save means. Wrapping here keeps that split
	 * and means a sheet rendered without a page still posts natively.
	 */
	const formAction = (node: HTMLFormElement) => enhance(node, closeOnSuccess);

	// ------------------------------------------------------------ groups

	let groupsOpen = $state(false);

	/** Every groups-sheet form: toast, let the sheet close its dialog, reload. */
	const groupsAction = (node: HTMLFormElement, done?: () => void) =>
		enhance(node, ({ action }) => async ({ result, update }) => {
			if (result.type === 'success') {
				done?.();
				toast.success(
					action.search.includes('deleteGroup')
						? t('accounts.group_deleted')
						: action.search.includes('createGroup')
							? t('accounts.group_created')
							: t('accounts.group_updated')
				);
			}
			await update({ navigate: false });
		});

	// ----------------------------------------------------------- reorder

	/*
	 * A wallet's place in its group, saved once the rows stop moving: five
	 * arrow presses are one request, not five racing ones. Only on the full
	 * list, because a filtered view's order would push the hidden wallets
	 * to the end of their group.
	 */
	let reorderIds = $state<string[]>([]);
	let reorderGroup = $state('');
	let reorderForm = $state<HTMLFormElement | null>(null);
	let reorderTimer: ReturnType<typeof setTimeout> | undefined;

	function reorderWallets(ids: string[], account: Wallet) {
		clearTimeout(reorderTimer);
		reorderTimer = setTimeout(async () => {
			reorderIds = ids;
			reorderGroup = account.group_id ?? '';
			await tick();
			reorderForm?.requestSubmit();
		}, 400);
	}

	const reorderAction = (node: HTMLFormElement) =>
		enhance(node, () => async ({ result, update }) => {
			if (result.type === 'success') toast.success(t('accounts.order_saved'));
			await update({ navigate: false });
		});
	const detailAction = (node: HTMLFormElement) => enhance(node, toastOnSuccess);
</script>

<svelte:head><title>{pageTitle(t('nav.accounts'))}</title></svelte:head>

<!--
	A bounded column, as the transactions page is: `<main>` already has a
	definite height, so `min-h-0 flex-1` resolves to whatever is left and the
	table scrolls inside it rather than taking the page with it.
-->
<div class="flex min-h-0 flex-1 flex-col gap-4">
	<!-- The heading stays for anyone navigating by headings; only its ink is
	     gone, as on the transactions page (UI-6). -->
	<h1 class="sr-only">{t('nav.accounts')}</h1>

	<AccountSummaryCards
		class="shrink-0"
		total={data.totals.total}
		currency={data.baseCurrency}
		count={data.totals.count}
		counted={data.totals.counted}
		unconverted={data.totals.unconverted}
	/>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters={bar.filters}
				facets={[
					{ id: 'group', label: t('accounts.col_group'), options: groupOptions },
					{ id: 'currency', label: t('accounts.currency'), options: currencyOptions }
				]}
				placeholder={t('accounts.search_placeholder')}
				showAmount={false}
				showDate={false}
				class="w-full"
			/>
		</div>

		{#if canEdit}
			<div class="flex shrink-0 items-center gap-2">
				<Button variant="outline" onclick={() => (groupsOpen = true)}>
					<FolderCog />
					{t('accounts.manage_groups')}
				</Button>
				<Button onclick={openNew}>
					<Plus />
					{t('accounts.add')}
				</Button>
			</div>
		{/if}
	</div>

	<AccountsDataTable
		loading={reloading(['search', 'group_id', 'currency'])}
		class="min-h-0 flex-1"
		accounts={data.wallets}
		groups={data.groups}
		{canEdit}
		emptyTitle={data.filtered ? t('accounts.empty_filtered_title') : t('accounts.empty_title')}
		emptyDescription={data.filtered
			? t('accounts.empty_filtered_description')
			: t('accounts.empty_description')}
		emptyActionLabel={t('accounts.add')}
		onAdd={openNew}
		onOpenRow={(account) => {
			detail = account;
			detailOpen = true;
		}}
		onEditRow={openEdit}
		onDeleteRow={askDelete}
		onSetDefault={(account) =>
			post('?/setDefaultWallet', { id: account.id }, t('accounts.default_set'))}
		onReorder={canEdit && !data.filtered ? reorderWallets : undefined}
		onGroupChange={(account, groupId) =>
			post('?/setGroup', { id: account.id, group_id: groupId }, t('accounts.group_updated'))}
		createLabel={(typed) => t('common.create_named', { name: typed })}
	/>
</div>

<!-- Hidden, because the confirm dialog is what the reader answers; this is
     only how the answer reaches the server without JavaScript being the
     thing that deletes a row. -->
<form
	bind:this={deleteForm}
	method="POST"
	action="?/deleteWallet"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') toast.success(t('accounts.deleted'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={deleting?.id ?? ''} />
</form>

<AccountGroupsSheet bind:open={groupsOpen} groups={data.groups} {canEdit} enhance={groupsAction} />

<!-- The order a drag or an arrow key settled on, top first, for one group. -->
<form bind:this={reorderForm} method="POST" action="?/reorderWallets" class="hidden" use:reorderAction>
	<input type="hidden" name="group_id" value={reorderGroup} />
	{#each reorderIds as id (id)}
		<input type="hidden" name="ids" value={id} />
	{/each}
</form>

<AccountFormSheet
	bind:open={formOpen}
	account={editing}
	currencyLocked={editing?.has_transactions ?? false}
	groups={data.groups}
	baseCurrency={data.baseCurrency}
	{saving}
	fieldErrors={form?.fields}
	createLabel={(typed) => t('common.create_named', { name: typed })}
	enhance={formAction}
/>

<!--
	The detail sheet reads its account back out of the load rather than
	holding the row it was opened with, so an edit made inside it is the
	figure it shows afterwards.
-->
<AccountDetailSheet
	bind:open={detailOpen}
	account={detailAccount}
	groups={data.groups}
	baseCurrency={data.baseCurrency}
	rates={data.rates}
	{saving}
	enhance={detailAction}
/>

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('accounts.delete')}
	description={t('accounts.delete_confirm', { name: deleting?.name ?? '' })}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>
