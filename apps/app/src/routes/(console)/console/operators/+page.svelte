<script lang="ts">
	/**
	 * The console's operators (CSL-2, US-085), the standard list screen
	 * (D81): Add operator on the header line, the table below. A row's menu
	 * changes the role or revokes it, confirmed first.
	 */
	import Plus from '@lucide/svelte/icons/plus';

	import { enhance, type SubmitFunction } from '$app/forms';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { ConsoleOperatorSheet, ConsoleOperatorsDataTable } from '$lib/components/organisms/console';
	import { toastRefusal } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { ConsoleOperator } from '$lib/server/console';

	let { data, form } = $props();

	const canManage = $derived(data.operator.permissions.includes('console.operators.manage'));

	/** The last owner has its own words here: the shared LAST_OWNER is about workspaces. */
	function refused(result: Parameters<typeof toastRefusal>[0]): boolean {
		if (result.type === 'failure' && result.data?.code === 'LAST_OWNER') {
			toast.error(t('console.operators.last_owner'));
			return true;
		}
		return toastRefusal(result);
	}

	// ------------------------------------------------------- add, change

	let sheetOpen = $state(false);
	let editing = $state<ConsoleOperator | null>(null);
	let saving = $state(false);

	function openAdd() {
		editing = null;
		sheetOpen = true;
	}
	function openChange(operator: ConsoleOperator) {
		editing = operator;
		sheetOpen = true;
	}

	const submitSave: SubmitFunction = () => {
		saving = true;
		const adding = editing === null;
		return async ({ result, update }) => {
			saving = false;
			if (refused(result)) return;
			if (result.type === 'success') {
				sheetOpen = false;
				toast.success(adding ? t('console.operators.toasts.added') : t('console.operators.toasts.changed'));
			}
			await update({ navigate: false });
		};
	};
	const saveAction = (node: HTMLFormElement) => enhance(node, submitSave);

	// ------------------------------------------------------------ revoke

	let target = $state<ConsoleOperator | null>(null);
	let confirmRevoke = $state(false);
	let revokeForm = $state<HTMLFormElement | null>(null);

	function askRevoke(operator: ConsoleOperator) {
		target = operator;
		confirmRevoke = true;
	}
</script>

<svelte:head><title>{pageTitle(t('console.nav_operators'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_operators')}</h1>

	{#if canManage}
		<div class="flex shrink-0 items-center justify-end">
			<Button onclick={openAdd}>
				<Plus />
				{t('console.operators.add')}
			</Button>
		</div>
	{/if}

	<ConsoleOperatorsDataTable
		class="min-h-0 flex-1"
		operators={data.operators}
		selfId={data.operator.id}
		{canManage}
		onChangeRow={openChange}
		onRevokeRow={askRevoke}
	/>
</div>

<ConsoleOperatorSheet
	bind:open={sheetOpen}
	operator={editing}
	roles={data.roles}
	{saving}
	fieldErrors={form?.fields}
	enhance={saveAction}
/>

<form
	bind:this={revokeForm}
	method="POST"
	action="?/revoke"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		// No form to show fields beside here: say any refusal in a toast.
		if (result.type === 'failure') {
			refused({ type: 'failure', data: { code: result.data?.code } });
			return;
		}
		if (result.type === 'success') toast.success(t('console.operators.toasts.revoked'));
		await update({ navigate: false });
	}}
>
	<input type="hidden" name="user_id" value={target?.user_id ?? ''} />
</form>

<ConfirmDialog
	bind:open={confirmRevoke}
	title={t('console.operators.revoke_confirm.title')}
	description={t('console.operators.revoke_confirm.description', { email: target?.email ?? '' })}
	confirmLabel={t('console.operators.revoke_confirm.confirm')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => revokeForm?.requestSubmit()}
/>
