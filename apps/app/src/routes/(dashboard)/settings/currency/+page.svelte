<script lang="ts">
	/**
	 * The workspace currency (WAL-5, WAL-6, WAL-7, D104, D105): the old Main
	 * Currency section, less its symbol position and decimal places, which
	 * this product takes from the currency itself (D12).
	 *
	 * Until the first transaction it is a plain setting. After that the
	 * picker is locked, because changing the label would reinterpret every
	 * `base_amount` already written, and an owner may convert instead: one
	 * rate, applied to every transaction and budget. The page says, before
	 * anything is changed, that every figure from before will then read at
	 * that one rate and not at the rate of its own day.
	 */
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { enhance } from '$app/forms';

	import { toast } from 'svelte-sonner';

	import * as AlertDialog from '$lib/components/atoms/alert-dialog';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/atoms/alert';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { Separator } from '$lib/components/atoms/separator';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FormError } from '$lib/components/molecules/form-error';
	import { SelectCurrency } from '$lib/components/molecules/select-currency';
	import { SettingsSectionGroup, SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { formatRate } from '$lib/money';
	import { pageTitle } from '$lib/page-title';
	import { writeParams } from '$lib/url-state';
	import { WORKSPACE_CURRENCIES } from '$lib/workspaces';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	const isOwner = $derived(data.me.role === 'owner');
	const locked = $derived(data.workspace.currency_locked);
	const from = $derived(data.workspace.currency_code);

	let currency = $state('');
	$effect(() => {
		currency = data.workspace.currency_code;
	});

	/** The list a new workspace is offered, plus the current one if it is not on it. */
	const options = $derived(
		WORKSPACE_CURRENCIES.includes(from) ? WORKSPACE_CURRENCIES : [from, ...WORKSPACE_CURRENCIES]
	);

	let saving = $state(false);

	// ------------------------------------------------------------ convert

	/** The rate as typed: a decimal string, never parsed here (D12). */
	let rate = $state('');
	$effect(() => {
		rate = data.preview?.suggested_rate ?? '';
	});

	let confirmOpen = $state(false);
	let confirmText = $state('');
	let converting = $state(false);

	const validRate = $derived(/^\d+([.,]\d+)?$/.test(rate.trim()) && !/^0+([.,]0*)?$/.test(rate.trim()));
	/** A comma is how the app writes a decimal; the API reads a point. */
	const rateForApi = $derived(rate.trim().replace(',', '.'));

	function openConfirm() {
		confirmText = '';
		confirmOpen = true;
	}
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
					await update({ reset: false, navigate: false });
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
				<FieldError message={!locked ? form?.fields?.currency_code : undefined} />
			</div>
			{#if canEdit && !locked}
				<Button type="submit" loading={saving} disabled={currency === from}>
					{t('common.save')}
				</Button>
			{/if}
		</form>
	</SettingsSectionGroup>

	{#if locked}
		<Separator />

		<SettingsSectionGroup
			title={t('settings.currency_convert_title')}
			description={isOwner
				? t('settings.currency_convert_description')
				: t('settings.currency_convert_owner_only')}
		>
			{#if isOwner}
				<form
					id="convert-form"
					method="POST"
					action="?/convert"
					class="flex flex-col gap-6"
					use:enhance={() => {
						converting = true;
						return async ({ result, update }) => {
							converting = false;
							confirmOpen = false;
							if (result.type === 'success' && result.data?.converted) {
								const done = result.data.converted as {
									to: string;
									transactions: number;
									budgets: number;
								};
								toast.success(
									t('settings.currency_convert_done', {
										to: done.to,
										count: done.transactions,
										budgets: done.budgets
									})
								);
								writeParams({ to: null });
							}
							await update({ reset: false, navigate: false });
						};
					}}
				>
					<input type="hidden" name="currency_code" value={data.to} />

					<div class="grid gap-2">
						<Label for="convert-to" class="text-subtle text-xs font-normal">
							{t('settings.currency_convert_to')}
						</Label>
						<SelectCurrency
							id="convert-to"
							currencies={options.filter((code) => code !== from)}
							value={data.to}
							onChange={(code) => writeParams({ to: code })}
							placeholder={t('settings.currency_convert_to_placeholder')}
							ariaLabel={t('settings.currency_convert_to')}
						/>
						<FieldError message={form?.fields?.currency_code} />
					</div>

					{#if data.to}
						<div class="grid gap-2">
							<Label for="convert-rate" class="text-subtle text-xs font-normal">
								{t('settings.currency_convert_rate', { from, to: data.to })}
							</Label>
							<Input
								id="convert-rate"
								name="rate"
								inputmode="decimal"
								autocomplete="off"
								required
								bind:value={rate}
							/>
							<p class="text-subtle text-xs">
								{data.preview?.suggested_rate && data.preview.rate_date
									? t('settings.currency_convert_rate_hint', { date: data.preview.rate_date })
									: t('settings.currency_convert_rate_none', { from, to: data.to })}
							</p>
							<FieldError message={form?.fields?.rate} />
						</div>

						<Alert variant="warning">
							<TriangleAlert />
							<AlertTitle>{t('settings.currency_convert_warning_title')}</AlertTitle>
							<AlertDescription>
								{t('settings.currency_convert_warning', {
									count: data.preview?.transactions ?? 0,
									budgets: data.preview?.budgets ?? 0
								})}
							</AlertDescription>
						</Alert>

						<div>
							<Button
								type="button"
								variant="destructive"
								disabled={!validRate}
								onclick={openConfirm}
							>
								{t('settings.currency_convert_button', { to: data.to })}
							</Button>
						</div>
					{/if}
				</form>
			{/if}
		</SettingsSectionGroup>
	{/if}
</div>

<AlertDialog.Root bind:open={confirmOpen}>
	<AlertDialog.Content class="sm:max-w-md">
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t('settings.currency_convert_confirm_title', { to: data.to })}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{t('settings.currency_convert_confirm_body', {
					from,
					to: data.to,
					rate: validRate ? formatRate(rateForApi) : rate
				})}
			</AlertDialog.Description>
		</AlertDialog.Header>

		<!-- Outside the form in the DOM, since the dialog is portalled; the
		     `form` attribute is what submits it with the rest. -->
		<div class="grid gap-2">
			<Label for="convert-confirm" class="sr-only">
				{t('settings.currency_convert_confirm_label', { to: data.to })}
			</Label>
			<Input
				id="convert-confirm"
				name="confirm"
				form="convert-form"
				autocomplete="off"
				placeholder={t('settings.currency_convert_confirm_label', { to: data.to })}
				bind:value={confirmText}
			/>
		</div>

		<AlertDialog.Footer>
			<AlertDialog.Cancel>
				{#snippet child({ props })}
					<Button {...props} variant="outline">{t('common.cancel')}</Button>
				{/snippet}
			</AlertDialog.Cancel>
			<Button
				type="submit"
				form="convert-form"
				variant="destructive"
				loading={converting}
				disabled={confirmText.trim().toUpperCase() !== data.to}
			>
				{t('settings.currency_convert_button', { to: data.to })}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
