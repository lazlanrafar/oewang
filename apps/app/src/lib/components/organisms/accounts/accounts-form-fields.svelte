<script lang="ts">
	/**
	 * The account form's fields, with nothing around them.
	 *
	 * One field set, two containers, the same arrangement as
	 * `transactions/transaction-form-fields`: the sheet renders it, and the
	 * page renders it again inside `<noscript>` as a plain form. Writing the
	 * fields twice would mean two places to keep a rule, and the plain copy
	 * would be the one that rots.
	 *
	 * The group is the design system's picker, because its options come from
	 * the workspace (D79); `plain` swaps it for a native `<select>`, which is
	 * what the `<noscript>` copy renders, since a picker is a button and a
	 * button submits nothing. Every other control here is native either way:
	 * the currency is a text input and the rest are checkboxes.
	 *
	 * There is no balance field. A new account starts at zero, and an opening
	 * figure is a transaction rather than a column write (TXN-3): the detail
	 * sheet records it as an adjustment.
	 */
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { SelectGroup, UNGROUPED } from '$lib/components/molecules/select-group';
	import { t } from '$lib/i18n';
	import type { Wallet } from '$lib/server/ledger';
	import { NativeSelect } from '$lib/components/atoms/native-select';

	let {
		account = null,
		groups,
		baseCurrency,
		currencyLocked = false,
		fieldErrors,
		plain = false,
		createLabel
	}: {
		/** The account being edited, or null when this is a new one. */
		account?: Wallet | null;
		/** Omitted, the workspace's own groups, as the picker reads them. */
		groups?: { id: string; name: string }[];
		/** The workspace currency, shown as the placeholder a new account takes. */
		baseCurrency: string;
		/**
		 * The account already has transactions, so its currency cannot move
		 * (WAL-4). Worked out by the caller, which is the side that knows
		 * whether anything has been recorded against it.
		 */
		currencyLocked?: boolean;
		fieldErrors?: Record<string, string>;
		/** The `<noscript>` copy: native controls only, no picker. */
		plain?: boolean;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
	} = $props();

	// Seeded by the effect below rather than here: reading `account` in the
	// initialiser would capture the first one and keep showing its group
	// after the sheet was reused for another account.
	let groupValue = $state(UNGROUPED);

	/* The sheet is reused for the next account, so the field follows it. */
	$effect(() => {
		groupValue = account?.group_id ?? UNGROUPED;
	});

	const labelClass = 'text-subtle text-xs font-normal';
</script>

<div class="space-y-6">
	<div class="grid gap-2">
		<Label for="account-name" class={labelClass}>{t('accounts.col_name')}</Label>
		<!-- svelte-ignore a11y_autofocus -- the sheet exists to type a name into -->
		<Input
			id="account-name"
			name="name"
			required
			autofocus
			value={account?.name ?? ''}
			placeholder="Cash"
		/>
		<FieldError message={fieldErrors?.name} />
	</div>

	<div class="grid gap-2">
		<Label for="account-group" class={labelClass}>{t('accounts.col_group')}</Label>
		<!--
			A native select, so the form submits with JavaScript off. The empty
			option is a real choice rather than a prompt: it is how an account
			leaves its group, and the action turns `''` into a null.
		-->
		{#if plain}
			<NativeSelect id="account-group" name="group_id">
				<option value="" selected={!account?.group_id}>{t('accounts.ungrouped')}</option>
				{#each groups ?? [] as group (group.id)}
					<option value={group.id} selected={account?.group_id === group.id}>{group.name}</option>
				{/each}
			</NativeSelect>
		{:else}
			<SelectGroup
				id="account-group"
				{groups}
				creatable
				bind:value={groupValue}
				ungroupedLabel={t('accounts.ungrouped')}
				placeholder={t('accounts.group_placeholder')}
				searchPlaceholder={t('accounts.search_groups')}
				{createLabel}
			/>
			<!-- The picker's trigger is a button, so the value posts through
			     this. An account leaves its group by choosing "Ungrouped",
			     which the action reads as an empty string. -->
			<input type="hidden" name="group_id" value={groupValue === UNGROUPED ? '' : groupValue} />
		{/if}
		<FieldError message={fieldErrors?.group_id} />
	</div>

	<div class="grid gap-2">
		<Label for="account-currency" class={labelClass}>{t('accounts.currency')}</Label>
		<Input
			id="account-currency"
			name={currencyLocked ? undefined : 'currency_code'}
			maxlength={3}
			class="uppercase"
			disabled={currencyLocked}
			value={account?.currency_code ?? ''}
			placeholder={baseCurrency}
		/>
		{#if currencyLocked}
			<!--
				A disabled control submits nothing, and an absent `currency_code`
				reads to the action as "clear it". So the locked field carries the
				current code in a hidden input: the save is a no-op on this column
				rather than a blanking of it.
			-->
			<input type="hidden" name="currency_code" value={account?.currency_code ?? ''} />
		{/if}
		<p class="text-subtle text-xs">{t('accounts.currency_hint')}</p>
		<FieldError message={fieldErrors?.currency_code} />
	</div>

	<div class="grid gap-2">
		<div class="flex items-center gap-2">
			<Checkbox
				id="account-totals"
				name="is_included_in_totals"
				value="true"
				checked={account?.is_included_in_totals ?? true}
			/>
			<!--
				An unticked checkbox submits nothing at all, and the action reads a
				missing field as "leave it counted". This hidden companion sits
				after the checkbox so the first entry under the name is "true" when
				it is ticked and "false" when it is not, which is the only way the
				box can be used to switch the flag off without script.
			-->
			<input type="hidden" name="is_included_in_totals" value="false" />
			<Label for="account-totals">{t('accounts.include_in_totals')}</Label>
		</div>
		<p class="text-subtle text-xs">{t('accounts.include_in_totals_hint')}</p>
		<FieldError message={fieldErrors?.is_included_in_totals} />
	</div>
</div>
