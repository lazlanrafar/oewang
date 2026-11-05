<script lang="ts">
	/**
	 * The fields a new workspace needs, the old app's `BusinessDetailsForm`:
	 * a name and a base currency, a full-width submit underneath. Country is
	 * not asked: nothing here reads it.
	 *
	 * A container decides where it posts; this only renders the fields.
	 */
	import Loader2 from '@lucide/svelte/icons/loader-circle';

	import { Button } from '../../atoms/button/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { Label } from '../../atoms/label/index.js';
	import { FieldError } from '../../molecules/field-error/index.js';
	import { SelectCurrency } from '../../molecules/select-currency/index.js';
	import { t } from '$lib/i18n';
	import { WORKSPACE_CURRENCIES } from '$lib/workspaces';

	let {
		pending = false,
		errors,
		autofocus = false
	}: {
		pending?: boolean;
		errors?: Record<string, string[] | string> | null;
		autofocus?: boolean;
	} = $props();

	let name = $state('');
	let currency = $state('IDR');

	const errorOf = (field: string) => {
		const value = errors?.[field];
		return Array.isArray(value) ? value[0] : value;
	};
</script>

<div class="space-y-5">
	<div class="space-y-2">
		<Label for="workspace-name">{t('workspaces.name_label')}</Label>
		<Input
			id="workspace-name"
			name="name"
			placeholder={t('workspaces.name_placeholder')}
			maxlength={80}
			required
			{autofocus}
			bind:value={name}
			aria-invalid={errorOf('name') ? 'true' : undefined}
		/>
		<FieldError message={errorOf('name')} />
	</div>

	<div class="space-y-2">
		<Label for="workspace-currency">{t('workspaces.currency_label')}</Label>
		<SelectCurrency
			id="workspace-currency"
			name="currency_code"
			currencies={WORKSPACE_CURRENCIES}
			bind:value={currency}
		/>
		<p class="text-muted-foreground text-xs leading-relaxed">{t('workspaces.currency_hint')}</p>
		<FieldError message={errorOf('currency_code')} />
	</div>

	<div class="pt-2">
		<Button type="submit" class="w-full" disabled={pending || name.trim() === ''}>
			{#if pending}
				<Loader2 class="size-3.5 animate-spin" />
				{t('workspaces.creating')}
			{:else}
				{t('workspaces.create_submit')}
			{/if}
		</Button>
	</div>
</div>
