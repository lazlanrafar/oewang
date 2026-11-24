<script lang="ts">
	/**
	 * The debts screen (DEBT-11, D120), the old page's layout: four figures,
	 * a header with the filter bar on the left and Add Debt on the right, and
	 * the table, with the floating bulk bar over it (D81).
	 *
	 * The open debt (`?debt=`) and a debt being made from a transaction
	 * (`?source=`) are in the URL, so a link or a refresh keeps them (UI-8).
	 * A contact's name opens that contact's sheet on the contacts page, where
	 * Settle all lives.
	 *
	 * Every write is a form action, so the list afterwards is what the
	 * server holds rather than what the browser guessed.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import type { TableSort } from '$lib/components/molecules/data-table';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		DebtsBulkBar,
		DebtsDataTable,
		DebtsDetailSheet,
		DebtsFormSheet,
		DebtsPaymentSheet,
		DebtsSummaryCards
	} from '$lib/components/organisms/debts';
	import { localToday } from '$lib/debts';
	import { messageForCode } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { Debt } from '$lib/server/debts';
	import { readText, reloading, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	const baseCurrency = $derived(data.me.workspace.currency_code);
	const today = localToday();

	// ------------------------------------------------------------ the rows

	const loaded = $derived({ rows: data.debts, page: data.meta.page ?? 1, key: data.filterKey });
	// Seeded from the load, so the server render and the first paint show the rows.
	const held = pagedRows<Debt>(untrack(() => loaded));
	$effect(() => {
		const next = loaded;
		untrack(() => held.update(next));
	});
	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	// ------------------------------------------------------------ the URL

	/** The default is the nearest due date first, which the URL leaves unsaid. */
	const sort = $derived.by<TableSort>(() => {
		const key = readText(page.url, 'sort') || 'due_date';
		return { key, descending: readText(page.url, 'order') === 'desc' };
	});

	function changeSort(next: TableSort) {
		const isDefault = next.key === null || (next.key === 'due_date' && !next.descending);
		writeParams({
			sort: isDefault ? null : next.key,
			order: isDefault ? null : next.descending ? 'desc' : 'asc',
			page: null
		});
	}

	/** The search and the two facets, in the URL; a change starts at page one. */
	const bar = filterBar({ status: 'status', type: 'type' }, { resetPage: true });

	const STATUS_OPTIONS = [
		{ id: 'unpaid', name: t('debts.statuses.unpaid') },
		{ id: 'partial', name: t('debts.statuses.partial') },
		{ id: 'paid', name: t('debts.statuses.paid') }
	];
	const TYPE_OPTIONS = [
		{ id: 'receivable', name: t('debts.types.receivable') },
		{ id: 'payable', name: t('debts.types.payable') }
	];

	const clear = () =>
		writeParams({ search: null, status: null, type: null, contact_id: null, page: null });

	// ------------------------------------------------------------- sheets

	let formOpen = $state(false);
	let editing = $state<Debt | null>(null);
	let saving = $state(false);

	function openNew() {
		editing = null;
		formOpen = true;
	}

	function openEdit(debt: Debt) {
		editing = debt;
		formOpen = true;
	}

	/* `?source=` opens the form for a debt made from that transaction (DEBT-12). */
	$effect(() => {
		if (data.source) untrack(openNew);
	});

	function closeForm(open: boolean) {
		if (!open && readText(page.url, 'source')) writeParams({ source: null });
	}

	const closeOnSuccess: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				formOpen = false;
				toast.success(editing ? t('debts.toasts.updated') : t('debts.toasts.created'));
				if (data.source) await writeParams({ source: null });
			}
			await update({ navigate: false });
		};
	};
	const formAction = (node: HTMLFormElement) => enhance(node, closeOnSuccess);

	/* The open debt, addressed by the URL so a row can be linked to. */
	const detailOpen = $derived(data.open !== null);
	const openDebt = (debt: Debt) => writeParams({ debt: debt.id }, { push: true });
	const closeDebt = () => writeParams({ debt: null }, { push: true });

	let paymentOpen = $state(false);
	let paying = $state(false);
	const payAction = (node: HTMLFormElement) =>
		enhance(node, () => {
			paying = true;
			return async ({ result, update }) => {
				paying = false;
				if (result.type === 'success') {
					paymentOpen = false;
					toast.success(t('debts.toasts.payment_recorded'));
				}
				await update({ navigate: false });
			};
		});

	// ------------------------------------------------------- confirmations

	let selection = $state<string[]>([]);

	let confirmDelete = $state(false);
	let deleting = $state<Debt | { id: string } | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);

	function askDelete(debt: { id: string }) {
		deleting = debt;
		confirmDelete = true;
	}

	let confirmBulk = $state(false);
	let bulkDeleting = $state(false);
	let bulkForm = $state<HTMLFormElement | null>(null);

	let confirmCancel = $state(false);
	let cancelling = $state<string | null>(null);
	let cancelForm = $state<HTMLFormElement | null>(null);
</script>

<svelte:head><title>{pageTitle(t('nav.debts'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('nav.debts')}</h1>

	<DebtsSummaryCards class="shrink-0" summary={data.summary} />

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters={bar.filters}
				facets={[
					{ id: 'status', label: t('debts.status_label'), options: STATUS_OPTIONS },
					{ id: 'type', label: t('debts.type_label'), options: TYPE_OPTIONS, multiple: false }
				]}
				placeholder={t('debts.search_placeholder')}
				showAmount={false}
				showDate={false}
				class="w-full"
			/>
		</div>

		{#if canEdit}
			<div class="flex items-center gap-2">
				<Button onclick={openNew}>
					<Plus />
					{t('debts.add_button')}
				</Button>
			</div>
		{/if}
	</div>

	<DebtsDataTable
		loading={reloading(['search', 'status', 'type', 'contact_id', 'sort', 'order'])}
		class="min-h-0 flex-1"
		debts={held.rows}
		{today}
		{sort}
		onSortChange={changeSort}
		bind:selection
		{canEdit}
		filtered={data.filtered}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		onAdd={openNew}
		onClear={clear}
		onOpenRow={openDebt}
		onOpenContact={(id) => goto(`/contacts?contact=${encodeURIComponent(id)}`)}
		onEditRow={openEdit}
		onDeleteRow={askDelete}
	/>

	{#if canEdit}
		<DebtsBulkBar
			count={selection.length}
			deleting={bulkDeleting}
			onClear={() => (selection = [])}
			onDelete={() => (confirmBulk = true)}
		/>
	{/if}
</div>

<!-- Hidden forms: a confirm dialog is what the reader answers, and these are
     how the answer reaches the server without JavaScript deleting a row. -->
<form
	bind:this={deleteForm}
	method="POST"
	action="?/delete"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') {
			toast.success(t('debts.toasts.deleted'));
			if (data.open?.id === deleting?.id) await writeParams({ debt: null });
		}
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={deleting?.id ?? ''} />
</form>

<form
	bind:this={bulkForm}
	method="POST"
	action="?/bulkDelete"
	class="hidden"
	use:enhance={() => {
		bulkDeleting = true;
		const count = selection.length;
		return async ({ result, update }) => {
			bulkDeleting = false;
			if (result.type === 'success') {
				toast.success(t('debts.toasts.bulk_deleted', { count }));
				selection = [];
			}
			await update({ navigate: false });
		};
	}}
>
	{#each selection as id (id)}<input type="hidden" name="id" value={id} />{/each}
</form>

<form
	bind:this={cancelForm}
	method="POST"
	action="?/cancelPayment"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') toast.success(t('debts.toasts.payment_cancelled'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={data.open?.id ?? ''} />
	<input type="hidden" name="payment_id" value={cancelling ?? ''} />
</form>

<DebtsFormSheet
	bind:open={formOpen}
	onOpenChange={closeForm}
	debt={editing}
	source={editing ? null : data.source}
	{baseCurrency}
	{saving}
	fieldErrors={form?.fields}
	createLabel={(typed) => t('common.create_named', { name: typed })}
	enhance={formAction}
/>

<DebtsDetailSheet
	open={detailOpen}
	onOpenChange={(open) => {
		if (!open) closeDebt();
	}}
	debt={data.open}
	{canEdit}
	sourceHref={data.open?.source_transaction_id
		? `/transactions?detail=${encodeURIComponent(data.open.source_transaction_id)}`
		: null}
	onDelete={() => data.open && askDelete(data.open)}
	onRecordPayment={() => (paymentOpen = true)}
	onCancelPayment={(id) => {
		cancelling = id;
		confirmCancel = true;
	}}
/>

<DebtsPaymentSheet
	bind:open={paymentOpen}
	debt={data.open}
	{baseCurrency}
	saving={paying}
	fieldErrors={form?.fields}
	enhance={payAction}
/>

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('debts.confirmations.delete_title')}
	description={t('debts.confirmations.delete_description')}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>

<ConfirmDialog
	bind:open={confirmBulk}
	title={t('debts.bulk.delete_title', { count: selection.length })}
	description={t('debts.bulk.delete_description', { count: selection.length })}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => bulkForm?.requestSubmit()}
/>

<ConfirmDialog
	bind:open={confirmCancel}
	title={t('debts.confirmations.cancel_payment_title')}
	description={t('debts.confirmations.cancel_payment_description')}
	confirmLabel={t('debts.details.cancel_payment')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => cancelForm?.requestSubmit()}
/>
