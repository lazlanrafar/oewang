<script lang="ts">
	/**
	 * The console's plans (PLN-1, OEW-131), the standard list screen (D81):
	 * the search on the left of the header line, New plan on the right, the
	 * table below. A row opens the plan's sheet, editable unless it is the
	 * system plan.
	 */
	import Plus from '@lucide/svelte/icons/plus';

	import { enhance, type SubmitFunction } from '$app/forms';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { ConsolePlanSheet, ConsolePlansDataTable } from '$lib/components/organisms/console';
	import { toastRefusal } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { ConsolePlan } from '$lib/server/console';
	import { reloading, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const canManage = $derived(data.operator.permissions.includes('console.plans.manage'));
	const bar = filterBar();

	// ----------------------------------------------------- create, edit, view

	let sheetOpen = $state(false);
	let current = $state<ConsolePlan | null>(null);
	let mode = $state<'create' | 'edit' | 'view'>('view');
	let saving = $state(false);

	function openCreate() {
		current = null;
		mode = 'create';
		sheetOpen = true;
	}
	function openPlan(plan: ConsolePlan) {
		current = plan;
		mode = canManage && !plan.is_system ? 'edit' : 'view';
		sheetOpen = true;
	}

	const submitSave: SubmitFunction = () => {
		saving = true;
		const creating = mode === 'create';
		return async ({ result, update }) => {
			saving = false;
			if (toastRefusal(result)) return;
			if (result.type === 'success') {
				sheetOpen = false;
				toast.success(creating ? t('console.plans.toasts.created') : t('console.plans.toasts.updated'));
			}
			await update({ navigate: false });
		};
	};
	const saveAction = (node: HTMLFormElement) => enhance(node, submitSave);

	// ------------------------------------------------------------ delete

	let target = $state<ConsolePlan | null>(null);
	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);

	function askDelete(plan: ConsolePlan) {
		target = plan;
		confirmDelete = true;
	}
</script>

<svelte:head><title>{pageTitle(t('console.nav_plans'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_plans')}</h1>

	<div class="flex shrink-0 items-center gap-2">
		<DataTableFilter
			bind:filters={bar.filters}
			placeholder={t('console.plans.search_placeholder')}
			showAmount={false}
			showDate={false}
			class="min-w-0 flex-1"
		/>
		{#if canManage}
			<Button onclick={openCreate}>
				<Plus />
				{t('console.plans.add')}
			</Button>
		{/if}
	</div>

	<ConsolePlansDataTable
		loading={reloading(['search'])}
		class="min-h-0 flex-1"
		plans={data.plans}
		{canManage}
		filtered={data.filtered}
		onClear={() => writeParams({ search: null })}
		onOpenRow={openPlan}
		onEditRow={openPlan}
		onDeleteRow={askDelete}
	/>
</div>

<ConsolePlanSheet
	bind:open={sheetOpen}
	plan={current}
	{mode}
	{saving}
	fieldErrors={form?.fields}
	enhance={saveAction}
/>

<form
	bind:this={deleteForm}
	method="POST"
	action="?/delete"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		// A refusal with fields (the system plan) still wants saying: there is no form here.
		if (result.type === 'failure' && result.data?.fields) {
			toastRefusal({ type: 'failure', data: { code: result.data.code } });
			return;
		}
		if (toastRefusal(result)) return;
		if (result.type === 'success') toast.success(t('console.plans.toasts.deleted'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={target?.id ?? ''} />
</form>

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('console.plans.delete_confirm.title')}
	description={t('console.plans.delete_confirm.description', { name: target?.name ?? '' })}
	confirmLabel={t('console.plans.delete_confirm.confirm')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>
