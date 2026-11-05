<script lang="ts">
	/**
	 * Categories and the assistant (US-013).
	 *
	 * Every mutation is a form action, so the page works with JavaScript
	 * disabled: a dialog is a `<form method="POST">` and a row action is a
	 * button inside one. The open tab lives in `?tab=` (UI-8, D55).
	 *
	 * Wallets were a third tab here until /accounts took them (US-013b);
	 * `?tab=wallets` redirects there in the load.
	 */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Plus from '@lucide/svelte/icons/plus';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import * as Dialog from '$lib/components/atoms/dialog';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { NativeSelect } from '$lib/components/atoms/native-select';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		instructionsRemaining,
		instructionsWithinLimit,
		languageLabelKey,
		RESPONSE_LANGUAGES,
		toResponseLanguage
	} from '$lib/ai-settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { readParam, writeParams } from '$lib/url-state';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const TABS = ['categories', 'assistant'] as const;
	const activeTab = $derived(readParam(page.url, 'tab', TABS, 'categories'));

	const canEdit = $derived(data.me.role !== 'member');

	const income = $derived(data.categories.filter((category) => category.type === 'income'));
	const expense = $derived(data.categories.filter((category) => category.type === 'expense'));

	/*
	 * The assistant tab (CHAT-10).
	 *
	 * The instructions are held here rather than read off the form, because
	 * the counter has to move as the user types. The stored value is
	 * written back whenever the page reloads its data, which is what a
	 * successful save does.
	 */
	let instructions = $state('');
	let assistantSaved = $state(false);

	$effect(() => {
		instructions = data.assistant?.custom_instructions ?? '';
	});

	const remaining = $derived(instructionsRemaining(instructions));
	const instructionsTooLong = $derived(!instructionsWithinLimit(instructions));
	const responseLanguage = $derived(toResponseLanguage(data.assistant?.response_language));

	/** Confirm the save where the user is looking, rather than at the top. */
	const markSaved: SubmitFunction = () => {
		return async ({ result, update }) => {
			assistantSaved = result.type === 'success';
			await update();
		};
	};

	/*
	 * One dialog for every category, holding the row it is editing. A
	 * dialog per row would mount one form per category; this mounts one
	 * and swaps what it points at.
	 */
	let categoryDialog = $state<{
		open: boolean;
		category: (typeof data.categories)[number] | null;
		type: 'income' | 'expense';
	}>({ open: false, category: null, type: 'expense' });

	/*
	 * One confirmation dialog for every delete on this screen (UI-4).
	 *
	 * The design system's alert dialog rather than the browser's `confirm`,
	 * which blocks the renderer until it is dismissed and cannot be
	 * translated. The form it submits is below, so a delete is still an
	 * ordinary form action.
	 */
	let pendingDelete = $state<{
		open: boolean;
		action: string;
		id: string;
		title: string;
		description: string;
	}>({ open: false, action: '', id: '', title: '', description: '' });
	let deleteForm = $state<HTMLFormElement | null>(null);

	/**
	 * Close the dialog once the action it submitted has succeeded.
	 *
	 * A failure leaves it open with what the user typed still in it, because
	 * the alternative is retyping a form to fix one field.
	 */
	const closeOnSuccess: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				categoryDialog = { ...categoryDialog, open: false, category: null };
			}
			await update();
		};
	};
</script>

<svelte:head><title>{t('settings.title')} · {t('app.name')}</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-6">
	<div>
		<h1 class="text-h2">{t('settings.title')}</h1>
		<p class="text-subtle text-small mt-1">{t('settings.subtitle')}</p>
	</div>

	<!-- The API's own message is for developers; the user sees a dictionary
	     string keyed by the code (UI-1). -->
	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<Tabs.Root value={activeTab} onValueChange={(tab) => writeParams({ tab })}>
		<Tabs.List variant="segmented">
			<Tabs.Trigger value="categories" variant="segmented">
				{t('settings.tab_categories')}
			</Tabs.Trigger>
			<Tabs.Trigger value="assistant" variant="segmented">
				{t('settings.tab_assistant')}
			</Tabs.Trigger>
		</Tabs.List>

		<!-- --------------------------------------------------- categories -->
		<Tabs.Content value="categories" class="mt-6 space-y-6">
			<p class="text-subtle text-small max-w-xl">{t('settings.categories_description')}</p>

			<div class="grid gap-6 md:grid-cols-2">
				{#each [{ type: 'expense' as const, rows: expense }, { type: 'income' as const, rows: income }] as column (column.type)}
					<section class="border">
						<header class="bg-muted/5 flex items-center justify-between border-b px-4 py-2.5">
							<h2 class="text-small font-medium">
								{column.type === 'income' ? t('settings.type_income') : t('settings.type_expense')}
							</h2>
							{#if canEdit}
								<Button
									variant="ghost"
									size="icon"
									class="size-7"
									aria-label={t('settings.new_category')}
									onclick={() =>
										(categoryDialog = { open: true, category: null, type: column.type })}
								>
									<Plus class="size-3.5" />
								</Button>
							{/if}
						</header>

						{#if column.rows.length === 0}
							<p class="text-subtle px-4 py-6 text-sm">{t('settings.no_categories')}</p>
						{:else}
							<ul>
								{#each column.rows as category, index (category.id)}
									<li class="flex items-center gap-2 border-b px-4 py-2.5 last:border-b-0">
										<span class="text-body min-w-0 flex-1 truncate">{category.name}</span>

										{#if canEdit}
											<form method="POST" action="?/moveCategory" use:enhance>
												<input type="hidden" name="id" value={category.id} />
												<input type="hidden" name="type" value={column.type} />
												<input type="hidden" name="direction" value="up" />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-7"
													disabled={index === 0}
													aria-label={t('common.move_up')}
												>
													<ChevronUp class="size-3.5" />
												</Button>
											</form>
											<form method="POST" action="?/moveCategory" use:enhance>
												<input type="hidden" name="id" value={category.id} />
												<input type="hidden" name="type" value={column.type} />
												<input type="hidden" name="direction" value="down" />
												<Button
													type="submit"
													variant="ghost"
													size="icon"
													class="size-7"
													disabled={index === column.rows.length - 1}
													aria-label={t('common.move_down')}
												>
													<ChevronDown class="size-3.5" />
												</Button>
											</form>

											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<Button
															{...props}
															variant="ghost"
															size="icon"
															class="size-7"
															aria-label={t('common.actions')}
														>
															<MoreHorizontal class="size-3.5" />
														</Button>
													{/snippet}
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end" class="w-52">
													<DropdownMenu.Item
														onclick={() =>
															(categoryDialog = { open: true, category, type: column.type })}
													>
														{t('common.edit')}
													</DropdownMenu.Item>
													<DropdownMenu.Separator />
													<DropdownMenu.Item
														class="text-destructive"
														onclick={() =>
															(pendingDelete = {
																open: true,
																action: '?/deleteCategory',
																id: category.id,
																title: t('settings.delete_category'),
																description: t('settings.delete_category_confirm', {
																	name: category.name
																})
															})}
													>
														{t('settings.delete_category')}
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/each}
			</div>
		</Tabs.Content>

		<!-- ---------------------------------------------------- assistant -->
		<Tabs.Content value="assistant" class="mt-6 space-y-6">
			<p class="text-subtle text-small max-w-xl">{t('settings.assistant_description')}</p>

			{#if !data.assistant}
				<!-- The read failed. Showing an empty form would invite an
				     admin to save "nothing set" over instructions that are
				     in force. -->
				<p class="text-destructive text-small max-w-xl" role="alert">
					{t('settings.assistant_unavailable')}
				</p>
			{:else if canEdit}
				<!-- The tab is named in the action, not only in the address
				     bar: a form action starting with `?` replaces the whole
				     query string, so without it a save with JavaScript off
				     lands back on the first tab (UI-8, D55). -->
				<form
					method="POST"
					action="?tab=assistant&/updateAssistant"
					use:enhance={markSaved}
					class="max-w-xl space-y-6 border p-4"
				>
					<div class="grid gap-2">
						<Label for="assistant-instructions" class="text-subtle text-xs font-normal">
							{t('settings.instructions_label')}
						</Label>
						<Textarea
							id="assistant-instructions"
							name="custom_instructions"
							rows={6}
							bind:value={instructions}
							oninput={() => (assistantSaved = false)}
							placeholder={t('settings.instructions_placeholder')}
							aria-describedby="assistant-instructions-hint assistant-instructions-count"
							aria-invalid={instructionsTooLong || form?.fields?.custom_instructions
								? 'true'
								: undefined}
						/>
						<p id="assistant-instructions-hint" class="text-subtle text-xs">
							{t('settings.instructions_hint')}
						</p>
						<!-- The count is announced, because the reason the save
						     button is disabled has to reach a reader who cannot
						     see the number next to it. -->
						<p
							id="assistant-instructions-count"
							class="text-xs {instructionsTooLong ? 'text-destructive' : 'text-subtle'}"
							aria-live="polite"
						>
							{instructionsTooLong
								? t('settings.instructions_over', { count: -remaining })
								: t('settings.instructions_remaining', { count: remaining })}
						</p>
						<FieldError message={form?.fields?.custom_instructions} />
					</div>

					<div class="grid gap-2">
						<Label for="assistant-language" class="text-subtle text-xs font-normal">
							{t('settings.language_label')}
						</Label>
						<!-- A native select, so the form submits without JavaScript. -->
						<NativeSelect
							id="assistant-language"
							name="response_language"
						>
							{#each RESPONSE_LANGUAGES as language (language)}
								<option value={language} selected={language === responseLanguage}>
									{t(languageLabelKey(language))}
								</option>
							{/each}
						</NativeSelect>
						<p class="text-subtle text-xs">{t('settings.language_hint')}</p>
						<FieldError message={form?.fields?.response_language} />
					</div>

					<div class="flex items-center gap-3">
						<Button type="submit" disabled={instructionsTooLong}>{t('common.save')}</Button>
						{#if assistantSaved}
							<p class="text-subtle text-xs" role="status">{t('settings.saved')}</p>
						{/if}
					</div>
				</form>
			{:else}
				<!-- A member sees what the assistant has been told, and why
				     they cannot change it. A disabled field with no
				     explanation reads as a broken page (UI-7). -->
				<div class="max-w-xl space-y-4 border p-4">
					<p class="text-subtle text-small">{t('settings.assistant_read_only')}</p>

					<div class="grid gap-1">
						<h2 class="text-subtle text-xs">{t('settings.instructions_label')}</h2>
						{#if data.assistant.custom_instructions}
							<p class="text-small whitespace-pre-wrap">
								{data.assistant.custom_instructions}
							</p>
						{:else}
							<p class="text-subtle text-small">{t('settings.instructions_empty')}</p>
						{/if}
					</div>

					<div class="grid gap-1">
						<h2 class="text-subtle text-xs">{t('settings.language_label')}</h2>
						<p class="text-small">{t(languageLabelKey(responseLanguage))}</p>
					</div>
				</div>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- ----------------------------------------------------------- dialogs -->

<Dialog.Root bind:open={categoryDialog.open}>
	<Dialog.Content class="sm:max-w-sm">
		<form
			method="POST"
			action={categoryDialog.category ? '?/updateCategory' : '?/createCategory'}
			use:enhance={closeOnSuccess}
		>
			<Dialog.Header>
				<Dialog.Title>
					{categoryDialog.category ? t('settings.edit_category') : t('settings.new_category')}
				</Dialog.Title>
			</Dialog.Header>

			{#if categoryDialog.category}
				<input type="hidden" name="id" value={categoryDialog.category.id} />
			{/if}

			<div class="space-y-4 py-4">
				<div class="grid gap-2">
					<Label for="category-name" class="text-subtle text-xs font-normal">
						{t('common.name')}
					</Label>
					<Input
						id="category-name"
						name="name"
						required
						value={categoryDialog.category?.name ?? ''}
						placeholder="Food"
					/>
				</div>

				<div class="grid gap-2">
					<Label for="category-type" class="text-subtle text-xs font-normal">
						{t('settings.type')}
					</Label>
					<NativeSelect
						id="category-type"
						name="type"
					>
						<option
							value="expense"
							selected={(categoryDialog.category?.type ?? categoryDialog.type) === 'expense'}
						>
							{t('settings.type_expense')}
						</option>
						<option
							value="income"
							selected={(categoryDialog.category?.type ?? categoryDialog.type) === 'income'}
						>
							{t('settings.type_income')}
						</option>
					</NativeSelect>
				</div>
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
	title={pendingDelete.title}
	description={pendingDelete.description}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>

<!-- The delete every confirmation submits. One form, whichever row it is
     for, because the action and the id are the only things that differ. -->
<form
	bind:this={deleteForm}
	method="POST"
	action={pendingDelete.action}
	class="hidden"
	use:enhance={closeOnSuccess}
>
	<input type="hidden" name="id" value={pendingDelete.id} />
</form>
