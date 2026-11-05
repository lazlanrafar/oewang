<script lang="ts">
	/**
	 * Income or expense categories, one type per page, as the old app's
	 * `CategoryForm` (D82): a title, an add button, the rows, a name-only
	 * dialog, and a confirmation before a delete.
	 *
	 * Create, rename and delete are form actions. Reordering is a drag (or
	 * the arrow keys on the handle), so it needs JavaScript, as it did in
	 * the old app; it still posts through a form action. The type is the
	 * path's, so the dialog asks only for a name.
	 */
	import Plus from '@lucide/svelte/icons/plus';
	import { tick } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';

	import { Button } from '$lib/components/atoms/button';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SettingsCategoryList, SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import type { Category } from '$lib/server/ledger';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.me.role !== 'member');

	/** Every string on the page, for this page's type (UI-1). */
	const copy = $derived(
		data.type === 'income'
			? {
					title: t('settings.income_title'),
					description: t('settings.income_description'),
					add: t('settings.income_add'),
					edit: t('settings.income_edit'),
					empty: t('settings.income_empty'),
					placeholder: t('settings.income_placeholder')
				}
			: {
					title: t('settings.expense_title'),
					description: t('settings.expense_description'),
					add: t('settings.expense_add'),
					edit: t('settings.expense_edit'),
					empty: t('settings.expense_empty'),
					placeholder: t('settings.expense_placeholder')
				}
	);

	/*
	 * One dialog for every row, holding the row it is editing: one form
	 * mounted, pointed at whichever row was picked.
	 */
	let dialog = $state<{ open: boolean; category: Category | null }>({
		open: false,
		category: null
	});

	/*
	 * One confirmation for every delete on this page (UI-4), the design
	 * system's rather than the browser's `confirm`, which cannot be
	 * translated. It submits the hidden form below, so a delete is still an
	 * ordinary form action.
	 */
	let pendingDelete = $state<{ open: boolean; category: Category | null }>({
		open: false,
		category: null
	});
	let deleteForm = $state<HTMLFormElement | null>(null);

	const openNew = () => (dialog = { open: true, category: null });

	/*
	 * A reorder is posted once the rows stop moving, not per arrow press:
	 * five quick presses are one request, and two requests racing each
	 * other's writes could leave an order the reader never chose.
	 */
	let reorderIds = $state<string[]>([]);
	let reorderForm = $state<HTMLFormElement | null>(null);
	let reorderTimer: ReturnType<typeof setTimeout> | undefined;

	function reorder(ids: string[]) {
		clearTimeout(reorderTimer);
		reorderTimer = setTimeout(async () => {
			reorderIds = ids;
			await tick();
			reorderForm?.requestSubmit();
		}, 400);
	}

	/**
	 * Close the dialog once its action has succeeded. A failure leaves it
	 * open with what was typed still in it.
	 */
	const closeOnSuccess: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') dialog = { open: false, category: null };
			await update();
		};
	};
</script>

<svelte:head><title>{pageTitle(copy.title, t('settings.title'))}</title></svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader title={copy.title} description={copy.description} />

	<div class="flex flex-col gap-4">
		{#if canEdit}
			<div class="flex justify-end">
				<Button size="sm" onclick={openNew}>
					<Plus class="size-3.5" />
					{copy.add}
				</Button>
			</div>
		{/if}

		<!-- The API's own message is for developers; the user sees a
		     dictionary string keyed by the code (UI-1). -->
		<FormError message={form?.code ? messageForCode(form.code) : undefined} />

		<SettingsCategoryList
			categories={data.categories}
			label={copy.title}
			{canEdit}
			empty={copy.empty}
			onReorder={reorder}
			onEditRow={(category) => (dialog = { open: true, category })}
			onDeleteRow={(category) => (pendingDelete = { open: true, category })}
		/>
	</div>
</div>

<Dialog.Root bind:open={dialog.open}>
	<Dialog.Content class="sm:max-w-sm">
		<form
			method="POST"
			action={dialog.category ? '?/updateCategory' : '?/createCategory'}
			use:enhance={closeOnSuccess}
		>
			<Dialog.Header>
				<Dialog.Title>{dialog.category ? copy.edit : copy.add}</Dialog.Title>
				<Dialog.Description>{copy.description}</Dialog.Description>
			</Dialog.Header>

			{#if dialog.category}
				<input type="hidden" name="id" value={dialog.category.id} />
			{/if}

			<div class="grid gap-2 py-4">
				<Label for="category-name" class="text-subtle text-xs font-normal">
					{t('common.name')}
				</Label>
				<Input
					id="category-name"
					name="name"
					required
					value={dialog.category?.name ?? ''}
					placeholder={copy.placeholder}
					aria-invalid={form?.fields?.name ? 'true' : undefined}
				/>
				<FieldError message={form?.fields?.name} />
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={pendingDelete.open}
	title={t('settings.delete_category')}
	description={t('settings.delete_category_confirm', { name: pendingDelete.category?.name ?? '' })}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>

<!-- The delete every confirmation submits: one form, whichever row it is for. -->
<form
	bind:this={deleteForm}
	method="POST"
	action="?/deleteCategory"
	class="hidden"
	use:enhance
>
	<input type="hidden" name="id" value={pendingDelete.category?.id ?? ''} />
</form>

<!-- The order a drag or an arrow key settled on, top first. -->
<form
	bind:this={reorderForm}
	method="POST"
	action="?/reorderCategories"
	class="hidden"
	use:enhance
>
	{#each reorderIds as id (id)}
		<input type="hidden" name="ids" value={id} />
	{/each}
</form>
