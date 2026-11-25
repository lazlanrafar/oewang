<script lang="ts">
	/**
	 * The console's roles (CSL-2, US-085), the standard list screen (D81):
	 * New role on the header line, the table below. A row opens the role's
	 * sheet, editable unless it is the system role or the operator's own.
	 */
	import Plus from '@lucide/svelte/icons/plus';

	import { enhance, type SubmitFunction } from '$app/forms';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { ConsoleRoleSheet, ConsoleRolesDataTable } from '$lib/components/organisms/console';
	import { toastRefusal } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { ConsoleRole } from '$lib/server/console';

	let { data, form } = $props();

	const held = $derived(data.operator.permissions);
	const canManage = $derived(held.includes('console.roles.manage'));
	const ownRoleId = $derived(data.operator.role.id);

	// ----------------------------------------------------- create, edit, view

	let sheetOpen = $state(false);
	let current = $state<ConsoleRole | null>(null);
	let mode = $state<'create' | 'edit' | 'view'>('view');
	let saving = $state(false);

	const editable = (role: ConsoleRole) => canManage && !role.is_system && role.id !== ownRoleId;

	function openCreate() {
		current = null;
		mode = 'create';
		sheetOpen = true;
	}
	function openRole(role: ConsoleRole) {
		current = role;
		mode = editable(role) ? 'edit' : 'view';
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
				toast.success(creating ? t('console.roles.toasts.created') : t('console.roles.toasts.updated'));
			}
			await update({ navigate: false });
		};
	};
	const saveAction = (node: HTMLFormElement) => enhance(node, submitSave);

	// ------------------------------------------------------------ delete

	let target = $state<ConsoleRole | null>(null);
	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);

	function askDelete(role: ConsoleRole) {
		target = role;
		confirmDelete = true;
	}
</script>

<svelte:head><title>{pageTitle(t('console.nav_roles'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_roles')}</h1>

	{#if canManage}
		<div class="flex shrink-0 items-center justify-end">
			<Button onclick={openCreate}>
				<Plus />
				{t('console.roles.add')}
			</Button>
		</div>
	{/if}

	<ConsoleRolesDataTable
		class="min-h-0 flex-1"
		roles={data.roles}
		{ownRoleId}
		{canManage}
		onOpenRow={openRole}
		onEditRow={openRole}
		onDeleteRow={askDelete}
	/>
</div>

<ConsoleRoleSheet
	bind:open={sheetOpen}
	role={current}
	{mode}
	{held}
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
		// A refusal with fields (the system role) still wants saying: there is no form here.
		if (result.type === 'failure' && result.data?.fields) {
			toastRefusal({ type: 'failure', data: { code: result.data.code } });
			return;
		}
		if (toastRefusal(result)) return;
		if (result.type === 'success') toast.success(t('console.roles.toasts.deleted'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="id" value={target?.id ?? ''} />
</form>

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('console.roles.delete_confirm.title')}
	description={t('console.roles.delete_confirm.description', { name: target?.name ?? '' })}
	confirmLabel={t('console.roles.delete_confirm.confirm')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>
