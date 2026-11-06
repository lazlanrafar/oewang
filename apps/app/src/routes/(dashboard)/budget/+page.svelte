<script lang="ts">
	/**
	 * The budget screen (BUD-1 to BUD-3, D103), the old page's layout: three
	 * figures, a header with the search on the left and the controls on the
	 * right, and the table. The month stepper is the one addition; the old
	 * page had a month in its query but no way to change it.
	 *
	 * Every write is a form action, so the list afterwards is what the
	 * server holds rather than what the browser guessed.
	 */
	import Plus from '@lucide/svelte/icons/plus';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import type { TableSort } from '$lib/components/molecules/data-table';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		BudgetFormSheet,
		BudgetMonthStepper,
		BudgetSummaryCards,
		BudgetsDataTable
	} from '$lib/components/organisms/budgets';
	import { messageForCode } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { BudgetLine } from '$lib/reports';
	import { readText, reloading, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const status = $derived(data.status);
	const canEdit = $derived(data.me.role !== 'member');

	// ------------------------------------------------------------ the URL

	/** The default is the category order, which the URL leaves unsaid. */
	const sort = $derived.by<TableSort>(() => {
		const key = readText(page.url, 'sort') || 'category';
		return { key, descending: readText(page.url, 'order') === 'desc' };
	});

	function changeSort(next: TableSort) {
		const isDefault = next.key === null || (next.key === 'category' && !next.descending);
		writeParams({
			sort: isDefault ? null : next.key,
			order: isDefault ? null : next.descending ? 'desc' : 'asc'
		});
	}

	/** The search and the status facet, in the URL like the sort. */
	const bar = filterBar({ state: 'state' });

	const STATE_OPTIONS = [
		{ id: 'safe', name: t('budget.state_safe'), colorClass: 'bg-primary' },
		{ id: 'warning', name: t('budget.state_warning'), colorClass: 'bg-amber-500' },
		{ id: 'over', name: t('budget.state_over'), colorClass: 'bg-destructive' }
	];

	// ------------------------------------------------------------- sheets

	let formOpen = $state(false);
	let editing = $state<BudgetLine | null>(null);
	let saving = $state(false);

	function openNew() {
		editing = null;
		formOpen = true;
	}

	function openEdit(budget: BudgetLine) {
		editing = budget;
		formOpen = true;
	}

	const closeOnSuccess: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				formOpen = false;
				toast.success(editing ? t('budget.updated') : t('budget.created'));
			}
			await update({ navigate: false });
		};
	};

	const formAction = (node: HTMLFormElement) => enhance(node, closeOnSuccess);

	// ------------------------------------------------------------ deletes

	let confirmDelete = $state(false);
	let deleting = $state<BudgetLine | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);

	function askDelete(budget: BudgetLine) {
		deleting = budget;
		confirmDelete = true;
	}
</script>

<svelte:head><title>{pageTitle(t('nav.budget'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('nav.budget')}</h1>

	<!-- The cards are the month's, so only a new month reloads them. -->
	<BudgetSummaryCards class="shrink-0" {status} loading={reloading(['month'])} />

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<div class="flex shrink-0 items-center justify-between gap-4">
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters={bar.filters}
				facets={[{ id: 'state', label: t('budget.col_status'), options: STATE_OPTIONS }]}
				placeholder={t('budget.search_placeholder')}
				showAmount={false}
				showDate={false}
				class="w-full"
			/>
		</div>

		<div class="flex items-center gap-2">
			<BudgetMonthStepper month={status.month} onChange={(month) => writeParams({ month })} />
			{#if canEdit}
				<Button onclick={openNew}>
					<Plus />
					{t('budget.new')}
				</Button>
			{/if}
		</div>
	</div>

	<BudgetsDataTable
		loading={reloading(['month', 'search', 'state', 'sort', 'order'])}
		class="min-h-0 flex-1"
		budgets={status.budgets}
		currency={status.currency_code}
		{sort}
		onSortChange={changeSort}
		{canEdit}
		filtered={data.filtered}
		onAdd={openNew}
		onClear={() => writeParams({ search: null, state: null })}
		onEditRow={openEdit}
		onDeleteRow={askDelete}
	/>
</div>

<!-- Hidden: the confirm dialog is what the reader answers, and this is how
     the answer reaches the server without JavaScript deleting a row. -->
<form
	bind:this={deleteForm}
	method="POST"
	action="?/delete"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') toast.success(t('budget.deleted'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={deleting?.id ?? ''} />
</form>

<BudgetFormSheet
	bind:open={formOpen}
	budget={editing}
	currency={status.currency_code}
	{saving}
	fieldErrors={form?.fields}
	createLabel={(typed) => t('common.create_named', { name: typed })}
	enhance={formAction}
/>

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('budget.delete_title')}
	description={t('budget.delete_confirm', { name: deleting?.category_name ?? '' })}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>
