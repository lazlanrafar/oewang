<script lang="ts">
	/**
	 * Ported from the old app's debt-form-sheet, to the same SHEET_GUIDE
	 * layout as the budget and transaction sheets: content at `p-0`, a header
	 * with no rule, a body with `pb-[100px]`, one full-width submit over it.
	 *
	 * The old fields: who owes whom (new debts only), the amount, the
	 * contact, the due date and a description (DEBT-1). The currency is new
	 * (D120): a debt carries its own, the workspace's by default. Type and
	 * currency are fixed once something is paid (DEBT-2), so they lock once
	 * the debt is no longer unpaid; the API refuses them anyway.
	 *
	 * It writes nothing itself: the form posts to the page's action, and the
	 * page passes its own `enhance`.
	 */
	import { untrack } from 'svelte';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { CurrencyInput } from '$lib/components/molecules/currency-input';
	import { DatePicker } from '$lib/components/molecules/date-picker';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { SelectContact } from '$lib/components/molecules/select-contact';
	import { SelectCurrency } from '$lib/components/molecules/select-currency';
	import { t } from '$lib/i18n';
	import { currencyDigits, currencySymbol } from '$lib/money';
	import type { Debt, DebtType } from '$lib/server/debts';

	let {
		open = $bindable(false),
		onOpenChange,
		debt = null,
		source = null,
		baseCurrency,
		saving = false,
		fieldErrors,
		createLabel,
		enhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** The debt being edited, or null to create one. */
		debt?: Debt | null;
		/** A transaction the new debt is made from (DEBT-9): its id, name, amount and currency. */
		source?: { id: string; name: string; amount: string; currency_code: string } | null;
		/** The workspace currency, a new debt's default. */
		baseCurrency: string;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The contact picker's create row, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const editing = $derived(!!debt);
	/* Something is paid: the API keeps type and currency as they are (DEBT-2). */
	const locked = $derived(!!debt && debt.status !== 'unpaid');

	let type = $state<DebtType>('receivable');
	let amount = $state('');
	let currency = $state('');
	let contactId = $state('');
	let dueDate = $state('');
	let description = $state('');

	// Keyed on the ids, not the objects: creating a contact reloads the page
	// data, and a fresh object for the same debt must not wipe the inputs.
	const key = $derived(`${debt?.id ?? ''}|${source?.id ?? ''}`);

	$effect(() => {
		if (!open) return;
		void key;
		untrack(() => {
			type = debt?.type ?? 'receivable';
			amount = debt ? trimZeros(debt.amount) : source ? trimZeros(source.amount) : '';
			currency = debt?.currency_code ?? source?.currency_code ?? baseCurrency;
			contactId = debt?.contact_id ?? '';
			dueDate = debt?.due_date?.slice(0, 10) ?? '';
			description = debt?.description ?? '';
		});
	});

	/** `250000.0000` as `250000`: the column's scale is not the user's. */
	function trimZeros(value: string): string {
		return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
	}

	const progressive = (node: HTMLFormElement) => enhance?.(node);

	const labelClass = 'text-muted-foreground text-xs font-normal';
	const hintClass = 'text-muted-foreground text-xs';
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<form
			method="POST"
			action={debt ? '?/update' : '?/create'}
			use:progressive
			class="flex h-full flex-col"
		>
			{#if debt}
				<input type="hidden" name="id" value={debt.id} />
			{/if}
			{#if source && !debt}
				<input type="hidden" name="source_transaction_id" value={source.id} />
			{/if}
			<input type="hidden" name="type" value={type} />
			<input type="hidden" name="amount" value={amount} />
			<input type="hidden" name="currency_code" value={currency} />
			<input type="hidden" name="contact_id" value={contactId} />

			<Sheet.Header class="shrink-0 px-6 pt-6">
				<Sheet.Title class="text-lg">
					{editing ? t('debts.form.edit_title') : t('debts.form.add_title')}
				</Sheet.Title>
				<Sheet.Description class="sr-only">{t('debts.form.description_sr')}</Sheet.Description>
			</Sheet.Header>

			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
				<div class="space-y-6">
					{#if !editing}
						<Tabs.Root value={type} onValueChange={(next) => (type = next as DebtType)}>
							<Tabs.List variant="segmented" class="w-full">
								<Tabs.Trigger value="receivable" variant="segmented" class="flex-1">
									{t('debts.form.type_receivable')}
								</Tabs.Trigger>
								<Tabs.Trigger value="payable" variant="segmented" class="flex-1">
									{t('debts.form.type_payable')}
								</Tabs.Trigger>
							</Tabs.List>
						</Tabs.Root>
					{/if}

					{#if source && !editing}
						<p class={hintClass}>{t('debts.form.from_transaction', { name: source.name })}</p>
					{/if}

					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label for="debt-amount" class={labelClass}>{t('debts.form.amount_label')}</Label>
							<CurrencyInput
								id="debt-amount"
								bind:value={amount}
								symbol={currencySymbol(currency)}
								decimals={currencyDigits(currency)}
							/>
							<p class={hintClass}>{t('debts.form.amount_description')}</p>
							<FieldError message={fieldErrors?.amount} />
						</div>
						<div class="grid gap-2">
							<Label for="debt-currency" class={labelClass}>{t('debts.form.currency_label')}</Label>
							<SelectCurrency id="debt-currency" bind:value={currency} disabled={locked} />
							<FieldError message={fieldErrors?.currency_code} />
						</div>
					</div>

					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label for="debt-contact" class={labelClass}>{t('debts.form.contact_label')}</Label>
							<SelectContact
								id="debt-contact"
								creatable
								bind:value={contactId}
								placeholder={t('debts.form.contact_placeholder')}
								{createLabel}
							/>
							<p class={hintClass}>{t('debts.form.contact_description')}</p>
							<FieldError message={fieldErrors?.contact_id} />
						</div>
						<div class="grid gap-2">
							<Label for="debt-due" class={labelClass}>{t('debts.form.due_date_label')}</Label>
							<DatePicker
								id="debt-due"
								name="due_date"
								bind:value={dueDate}
								placeholder={t('debts.form.due_date_placeholder')}
							/>
							<p class={hintClass}>{t('debts.form.due_date_description')}</p>
							<FieldError message={fieldErrors?.due_date} />
						</div>
					</div>

					<div class="grid gap-2">
						<Label for="debt-description" class={labelClass}>{t('debts.form.notes_label')}</Label>
						<Input
							id="debt-description"
							name="description"
							bind:value={description}
							placeholder={t('debts.form.notes_placeholder')}
							autocomplete="off"
						/>
						<FieldError message={fieldErrors?.description} />
					</div>
				</div>
			</div>

			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button type="submit" class="w-full" loading={saving}>{t('debts.form.submit')}</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
