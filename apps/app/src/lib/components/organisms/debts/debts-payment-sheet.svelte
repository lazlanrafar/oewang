<script lang="ts">
	/**
	 * Ported from the old app's payment-form-sheet: who the payment is with
	 * and what remains, then the amount and the account (DEBT-4).
	 *
	 * Three things the old sheet did not have. The account may be left
	 * empty, which records the payment without moving any money (DEBT-4).
	 * The date is the person's, so a payment entered late keeps its day.
	 * And an account in another currency shows the rate, prefilled from the
	 * newest snapshot and editable, with the figure that will move (DEBT-5,
	 * D39): the API computes and stores its own from the amount and the rate.
	 *
	 * The amount is in the debt's currency and never above what remains; the
	 * API refuses more (`PAYMENT_EXCEEDS_REMAINING`).
	 */
	import { untrack } from 'svelte';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { CurrencyInput } from '$lib/components/molecules/currency-input';
	import { DatePicker } from '$lib/components/molecules/date-picker';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { SelectAccount } from '$lib/components/molecules/select-account';
	import { crossRate, localToday } from '$lib/debts';
	import { t } from '$lib/i18n';
	import { currencyDigits, currencySymbol, formatMoney, multiplyDecimals } from '$lib/money';
	import type { Debt } from '$lib/server/debts';
	import { workspaceLists } from '$lib/workspace-data.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		debt,
		baseCurrency,
		saving = false,
		fieldErrors,
		enhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		debt: Debt | null;
		/** The workspace currency, which the snapshot's rates are against. */
		baseCurrency: string;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const lists = workspaceLists();
	const rates = $derived(new Map(lists.currencies.map((entry) => [entry.code, entry.rate])));

	let amount = $state('');
	let walletId = $state('');
	let date = $state('');
	let exchangeRate = $state('');

	const debtId = $derived(debt?.id ?? null);
	$effect(() => {
		if (!open) return;
		void debtId;
		untrack(() => {
			amount = debt ? trimZeros(debt.remaining_amount) : '';
			walletId = '';
			date = localToday();
			exchangeRate = '';
		});
	});

	const walletCurrency = $derived(
		lists.wallets.find((wallet) => wallet.id === walletId)?.currency_code ?? null
	);
	/** The account holds another currency than the debt (DEBT-5). */
	const foreign = $derived(!!debt && !!walletCurrency && walletCurrency !== debt.currency_code);
	const suggested = $derived(
		foreign && debt && walletCurrency
			? crossRate(rates, baseCurrency, debt.currency_code, walletCurrency)
			: null
	);

	/* Prefill the rate when the account changes, unless the person typed their own. */
	let prefilled = '';
	$effect(() => {
		const next = suggested;
		untrack(() => {
			if (!next) return;
			if (exchangeRate === '' || exchangeRate === prefilled) {
				prefilled = next;
				exchangeRate = next;
			}
		});
	});

	/** A preview of what moves in the account; the API stores its own. */
	const converted = $derived.by(() => {
		if (!foreign || !amount || !exchangeRate) return null;
		try {
			return multiplyDecimals(amount, exchangeRate);
		} catch {
			return null;
		}
	});

	function trimZeros(value: string): string {
		return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
	}

	const progressive = (node: HTMLFormElement) => enhance?.(node);
	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		{#if debt}
			<form method="POST" action="?/pay" use:progressive class="flex h-full flex-col">
				<input type="hidden" name="id" value={debt.id} />
				<input type="hidden" name="amount" value={amount} />
				<input type="hidden" name="wallet_id" value={walletId} />
				<input type="hidden" name="exchange_rate" value={foreign ? exchangeRate : ''} />

				<Sheet.Header class="bg-muted/5 shrink-0 border-b px-6 py-6 text-left">
					<Sheet.Title class="font-serif text-xl font-normal">{t('debts.payment.title')}</Sheet.Title>
					<Sheet.Description class="sr-only">{debt.contact_name}</Sheet.Description>
				</Sheet.Header>

				<div class="no-scrollbar flex-1 overflow-y-auto px-6 py-6">
					<div class="space-y-6">
						<div class="border-border/50 bg-muted/5 mb-8 space-y-2 rounded-none border p-4">
							<p class={capsLabel}>{t('debts.payment.paying_to_from')}</p>
							<p class="font-serif text-lg font-normal">{debt.contact_name}</p>
							<div class="border-border/50 border-t pt-2">
								<p class={capsLabel}>{t('debts.payment.remaining_balance')}</p>
								<p class="text-primary font-serif text-lg font-normal">
									{formatMoney(debt.remaining_amount, debt.currency_code)}
								</p>
							</div>
						</div>

						<div class="grid gap-2">
							<Label for="payment-amount" class={capsLabel}>{t('debts.payment.amount_to_pay')}</Label>
							<CurrencyInput
								id="payment-amount"
								bind:value={amount}
								symbol={currencySymbol(debt.currency_code)}
								decimals={currencyDigits(debt.currency_code)}
							/>
							<p class="text-muted-foreground text-[11px]">
								{t('debts.payment.amount_to_pay_description')}
							</p>
							<FieldError message={fieldErrors?.amount} />
						</div>

						<div class="grid gap-2">
							<Label for="payment-account" class={capsLabel}>{t('debts.payment.account_label')}</Label>
							<SelectAccount
								id="payment-account"
								bind:value={walletId}
								placeholder={t('debts.payment.account_placeholder')}
							/>
							<p class="text-muted-foreground text-[10px] tracking-wider uppercase opacity-60">
								{t('debts.payment.account_description')}
							</p>
							<FieldError message={fieldErrors?.wallet_id} />
						</div>

						{#if foreign && walletCurrency}
							<div class="grid gap-2">
								<Label for="payment-rate" class={capsLabel}>
									{t('debts.payment.rate_label', { from: debt.currency_code, to: walletCurrency })}
								</Label>
								<Input id="payment-rate" bind:value={exchangeRate} class="font-mono" inputmode="decimal" />
								{#if converted}
									<p class="text-body font-mono">
										{formatMoney(amount, debt.currency_code)} = {formatMoney(converted, walletCurrency)}
									</p>
								{/if}
								<p class="text-subtle text-xs">{t('debts.payment.rate_hint')}</p>
								<FieldError message={fieldErrors?.exchange_rate} />
							</div>
						{/if}

						<div class="grid gap-2">
							<Label for="payment-date" class={capsLabel}>{t('debts.payment.date_label')}</Label>
							<DatePicker id="payment-date" name="date" bind:value={date} />
							<FieldError message={fieldErrors?.date} />
						</div>
					</div>
				</div>

				<div class="bg-background mt-auto shrink-0 border-t p-6">
					<Button type="submit" size="caps" class="w-full" loading={saving}>
						{t('debts.payment.submit')}
					</Button>
				</div>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
