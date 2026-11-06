<script lang="ts">
	/**
	 * The workspace currency (WAL-5, WAL-6, D104): the old Main Currency
	 * section, less its symbol position and decimal places, which this
	 * product takes from the currency itself (D12).
	 *
	 * It can change only until the first transaction exists. After that the
	 * picker is disabled and the page says why: a change would reinterpret
	 * every `base_amount` already written.
	 */
	import { enhance } from '$app/forms';

	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { Label } from '$lib/components/atoms/label';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SelectCurrency } from '$lib/components/molecules/select-currency';
	import { SettingsSectionGroup, SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { WORKSPACE_CURRENCIES } from '$lib/workspaces';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	const locked = $derived(data.workspace.currency_locked);

	let currency = $state('');
	$effect(() => {
		currency = data.workspace.currency_code;
	});

	/** The list a new workspace is offered, plus the current one if it is not on it. */
	const options = $derived(
		WORKSPACE_CURRENCIES.includes(data.workspace.currency_code)
			? WORKSPACE_CURRENCIES
			: [data.workspace.currency_code, ...WORKSPACE_CURRENCIES]
	);

	let saving = $state(false);
</script>

<svelte:head>
	<title>{pageTitle(t('settings.currency_title'), t('settings.title'))}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader
		title={t('settings.currency_title')}
		description={t('settings.currency_description')}
	/>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<SettingsSectionGroup
		title={t('settings.currency_label')}
		description={locked
			? t('settings.currency_locked')
			: canEdit
				? t('settings.currency_open')
				: t('settings.currency_read_only')}
	>
		<form
			method="POST"
			action="?/update"
			class="flex flex-col gap-4 sm:flex-row sm:items-end"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'success') toast.success(t('settings.currency_saved'));
					await update({ reset: false });
				};
			}}
		>
			<div class="grid flex-1 gap-2">
				<Label for="workspace-currency" class="sr-only">{t('settings.currency_label')}</Label>
				<SelectCurrency
					id="workspace-currency"
					name="currency_code"
					currencies={options}
					bind:value={currency}
					disabled={locked || !canEdit}
					ariaLabel={t('settings.currency_label')}
				/>
				<FieldError message={form?.fields?.currency_code} />
			</div>
			{#if canEdit && !locked}
				<Button
					type="submit"
					loading={saving}
					disabled={currency === data.workspace.currency_code}
				>
					{t('common.save')}
				</Button>
			{/if}
		</form>
	</SettingsSectionGroup>
</div>
