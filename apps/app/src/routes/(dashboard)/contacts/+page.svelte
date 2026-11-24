<script lang="ts">
	/**
	 * The contacts screen (CON-2, D120), the old page's layout: four counts,
	 * the search and New Contact, and the table (D81). A row opens the
	 * contact's sheet, addressed by `?contact=` so the debts page can link
	 * to it and a refresh keeps it (UI-8).
	 *
	 * Every write is a form action. Settle all in the sheet posts to the
	 * debts page's action, which owns payments.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { navigating, page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import type { TableSort } from '$lib/components/molecules/data-table';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		ContactsDataTable,
		ContactsDetailSheet,
		ContactsFormSheet,
		ContactsMergeDialog,
		ContactsSummaryCards
	} from '$lib/components/organisms/contacts';
	import { contactCounts } from '$lib/contacts';
	import { messageForCode, toastRefusal } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { Contact } from '$lib/server/contacts';
	import { readText, reloading, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	const counts = $derived(contactCounts(data.all));

	const loaded = $derived({ rows: data.contacts, page: data.meta.page ?? 1, key: data.filterKey });
	const held = pagedRows<Contact>(untrack(() => loaded));
	$effect(() => {
		const next = loaded;
		untrack(() => held.update(next));
	});
	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	/** The default is by name, which the URL leaves unsaid. */
	const sort = $derived.by<TableSort>(() => {
		const key = readText(page.url, 'sort') || 'name';
		return { key, descending: readText(page.url, 'order') === 'desc' };
	});

	function changeSort(next: TableSort) {
		const isDefault = next.key === null || (next.key === 'name' && !next.descending);
		writeParams({
			sort: isDefault ? null : next.key,
			order: isDefault ? null : next.descending ? 'desc' : 'asc',
			page: null
		});
	}

	const bar = filterBar({}, { resetPage: true });

	// ------------------------------------------------------------- sheets

	let formOpen = $state(false);
	let editing = $state<Contact | null>(null);
	let saving = $state(false);

	function openNew() {
		editing = null;
		formOpen = true;
	}

	function openEdit(contact: Contact) {
		editing = contact;
		formOpen = true;
	}

	const saved = (after: () => void): SubmitFunction => () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (toastRefusal(result)) return;
			if (result.type === 'success') after();
			await update({ navigate: false });
		};
	};

	const formAction = (node: HTMLFormElement) =>
		enhance(
			node,
			saved(() => {
				formOpen = false;
				toast.success(editing ? t('contacts.toasts.updated') : t('contacts.toasts.created'));
			})
		);
	const quickEditAction = (node: HTMLFormElement) =>
		enhance(
			node,
			saved(() => toast.success(t('contacts.toasts.updated')))
		);

	let settling = $state(false);
	const settleAction = (node: HTMLFormElement) =>
		enhance(node, () => {
			settling = true;
			return async ({ result, update }) => {
				settling = false;
				if (toastRefusal(result)) return;
				if (result.type === 'success') toast.success(t('debts.toasts.settled'));
				await update({ navigate: false, invalidateAll: true });
			};
		});

	const detailOpen = $derived(data.open !== null);
	const openContact = (contact: Contact) => writeParams({ contact: contact.id }, { push: true });
	const closeContact = () => writeParams({ contact: null }, { push: true });

	// ------------------------------------------------------- delete, merge

	let target = $state<{ id: string; name: string } | null>(null);

	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);
	const askDelete = (contact: { id: string; name: string }) => {
		target = contact;
		confirmDelete = true;
	};

	let mergeOpen = $state(false);
	let merging = $state(false);
	const askMerge = (contact: { id: string; name: string }) => {
		target = contact;
		mergeOpen = true;
	};
	const mergeAction = (node: HTMLFormElement) =>
		enhance(node, () => {
			merging = true;
			const merged = target?.id;
			return async ({ result, update }) => {
				merging = false;
				if (toastRefusal(result)) return;
				if (result.type === 'success') {
					mergeOpen = false;
					toast.success(t('contacts.toasts.merged'));
					if (data.open?.contact.id === merged) await writeParams({ contact: null });
				}
				await update({ navigate: false });
			};
		});
</script>

<svelte:head><title>{pageTitle(t('nav.contacts'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('nav.contacts')}</h1>

	<ContactsSummaryCards class="shrink-0" {counts} />

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters={bar.filters}
				placeholder={t('contacts.search_placeholder')}
				showAmount={false}
				showDate={false}
				class="w-full"
			/>
		</div>
		{#if canEdit}
			<div class="flex items-center gap-2">
				<Button onclick={openNew}>
					<Plus />
					{t('contacts.add_button')}
				</Button>
			</div>
		{/if}
	</div>

	<ContactsDataTable
		loading={reloading(['search', 'sort', 'order'])}
		class="min-h-0 flex-1"
		contacts={held.rows}
		{sort}
		onSortChange={changeSort}
		{canEdit}
		filtered={data.filtered}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		onAdd={openNew}
		onClear={() => writeParams({ search: null, page: null })}
		onOpenRow={openContact}
		onEditRow={openEdit}
		onMergeRow={askMerge}
		onDeleteRow={askDelete}
	/>
</div>

<form
	bind:this={deleteForm}
	method="POST"
	action="?/delete"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (toastRefusal(result)) return;
		if (result.type === 'success') {
			toast.success(t('contacts.toasts.deleted'));
			if (data.open?.contact.id === target?.id) await writeParams({ contact: null });
		}
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={target?.id ?? ''} />
</form>

<ContactsFormSheet
	bind:open={formOpen}
	contact={editing}
	{saving}
	fieldErrors={form?.fields}
	enhance={formAction}
/>

<ContactsDetailSheet
	open={detailOpen}
	onOpenChange={(open) => {
		if (!open) closeContact();
	}}
	contact={data.open?.contact ?? null}
	debts={data.open?.debts ?? []}
	{canEdit}
	{saving}
	{settling}
	fieldErrors={form?.fields}
	enhanceUpdate={quickEditAction}
	enhanceSettle={settleAction}
	debtHref={(debt) => `/debts?debt=${encodeURIComponent(debt.id)}`}
	onDelete={() => data.open && askDelete(data.open.contact)}
	onMerge={() => data.open && askMerge(data.open.contact)}
/>

<ContactsMergeDialog bind:open={mergeOpen} contact={target} saving={merging} enhance={mergeAction} />

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('contacts.details.delete_confirm_title')}
	description={t('contacts.details.delete_confirm_desc')}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>
