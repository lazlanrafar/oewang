<script lang="ts">
	/**
	 * What the model read off a receipt, before anything is written
	 * (AI-2, AI-11, CHAT-13).
	 *
	 * Derived from the old app's `transaction-receipt-confirmation-modal`,
	 * with the part that matters kept and the part that does not dropped:
	 * every parsed field is editable, each one says whether the code
	 * replaced it or nobody is sure of it, and nothing exists as a
	 * transaction until the user presses the button.
	 *
	 * **One component, two containers.** The transactions page and the chat
	 * canvas mount this same sheet; `container` decides whether it brings a
	 * `Sheet.Root` with it or is simply the panel's contents (D31). Two
	 * renderings of a confirmation would be two chances to disagree about
	 * what is being confirmed.
	 *
	 * Every figure here is a string from the wire to the input (D12), and
	 * nothing is converted: the API computes what it stores and refuses a
	 * figure the client worked out (D27).
	 */
	import Calculator from '@lucide/svelte/icons/calculator';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { formatMoney } from '$lib/money.js';
	import {
		correctionFor,
		fieldFlag,
		itemsDisagree,
		itemsTotal,
		type ReceiptForm,
		type ReceiptQuality
	} from '$lib/receipt.js';
	import { t } from '$lib/i18n';

	import { Badge } from '../../atoms/badge/index.js';
	import { Button } from '../../atoms/button/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { Label } from '../../atoms/label/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import { CurrencyInput } from '../../molecules/currency-input/index.js';
	import { DatePicker } from '../../molecules/date-picker/index.js';
	import { SelectCurrency } from '../../molecules/select-currency/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import type { CategoryItem } from '../../molecules/select-category/index.js';
	import type { ComboboxItem } from '../../molecules/combobox/index.js';

	let {
		open = $bindable(false),
		onOpenChange,
		container = 'sheet',
		form = $bindable(),
		quality,
		fileId,
		fileName = '',
		accounts,
		categories,
		walletCurrency,
		saving = false,
		fieldErrors,
		action = '?/confirmReceipt',
		enhance,
		onCancel,
		onManualEntry
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** `panel` drops the sheet shell: the canvas is already the container. */
		container?: 'sheet' | 'panel';
		form: ReceiptForm;
		quality: ReceiptQuality;
		/** The receipt itself, which stays attached to what is created. */
		fileId: string;
		fileName?: string;
		accounts: ComboboxItem[];
		categories: CategoryItem[];
		/** The currency the chosen wallet holds, which `total` has to be in. */
		walletCurrency: string;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		action?: string;
		enhance?: (node: HTMLFormElement) => void;
		onCancel: () => void;
		/** Give up on the draft and type it by hand, image still attached (AI-3). */
		onManualEntry?: () => void;
	} = $props();

	const labelClass = 'text-subtle text-xs font-normal';

	/** A no-op action, so a caller that passes no `enhance` posts natively. */
	const progressive = (node: HTMLFormElement) => enhance?.(node);

	const flag = (field: string) => fieldFlag(field, quality);

	/*
	 * What the lines add up to, against the total being confirmed.
	 *
	 * A receipt with a service charge on it legitimately does not add up
	 * (TXN-12), so this is a sentence under the items and never a block on
	 * saving. It reads the edited figures rather than the parsed ones, so
	 * correcting a line answers the warning it raised.
	 */
	const lines = $derived(
		form.items.map((item) => ({
			name: item.name,
			amount: item.amount,
			quantity: null,
			unit_price: null
		}))
	);

	const linesTotal = $derived(itemsTotal(lines));
	const disagrees = $derived(itemsDisagree({ total: form.total, line_items: lines }));

	/*
	 * The entry currency has to be the wallet's.
	 *
	 * A receipt in another currency needs a rate, and a rate needs the
	 * fields the full form carries. Rather than grow a second rate editor
	 * here, the panel says so and offers the form (TXN-20).
	 */
	const currencyMismatch = $derived(form.currency !== walletCurrency);
	const confirmable = $derived(!currencyMismatch && form.total !== '' && form.walletId !== '');

	/** The line items, as the action reads them back. Figures stay strings. */
	const itemsPayload = $derived(
		JSON.stringify(
			form.items
				.filter((item) => item.name !== '' || item.amount !== '')
				.map((item) => ({
					name: item.name,
					quantity: item.quantity || null,
					unit_price: item.unitPrice || null,
					amount: item.amount
				}))
		)
	);
</script>

{#snippet mark(field: string)}
	{@const state = flag(field)}
	{#if state === 'corrected' || state === 'calculated'}
		<Badge variant="outline" class="gap-1">
			<Calculator class="size-3" aria-hidden="true" />
			{state === 'corrected' ? t('receipt.flag_corrected') : t('receipt.flag_calculated')}
		</Badge>
	{:else if state === 'check'}
		<Badge variant="outline" class="gap-1">
			<TriangleAlert class="size-3" aria-hidden="true" />
			{t('receipt.flag_check')}
		</Badge>
	{/if}
{/snippet}

<!--
	What the model read, under the field the code replaced (AI-11).

	Only for a field the model actually gave a figure for. When it gave
	nothing, the badge already says the code worked the figure out, and
	there is no second number to quote.
-->
{#snippet readAs(field: string)}
	{@const correction = correctionFor(field, quality)}
	{#if correction?.model_value}
		<p class="text-subtle text-xs">
			{t('receipt.model_read', {
				value: formatMoney(correction.model_value, form.currency)
			})}
		</p>
	{/if}
{/snippet}

{#snippet body()}
	<form method="POST" {action} use:progressive class="flex h-full flex-col">
		<!-- The whole write, as hidden fields: a receipt is always an
		     expense, and the file stays attached to what it created. -->
		<input type="hidden" name="type" value="expense" />
		<input type="hidden" name="wallet_id" value={form.walletId} />
		<input type="hidden" name="category_id" value={form.categoryId} />
		<input type="hidden" name="amount" value={form.total} />
		<input type="hidden" name="date" value={form.date} />
		<input type="hidden" name="name" value={form.merchant} />
		<input type="hidden" name="attachment_ids" value={fileId} />
		<input type="hidden" name="items" value={itemsPayload} />

		<div class="flex-1 space-y-6 overflow-y-auto px-6 pt-6 pb-[120px]">
			<!-- What the extraction thought of itself (AI-11). The user is
			     the one who decides whether it was right. -->
			<p class="text-subtle text-small">
				{t('receipt.quality', { score: quality.score })}
				{#if fileName}
					<span class="font-mono">· {fileName}</span>
				{/if}
			</p>

			{#if quality.corrected_fields.length > 0}
				<p class="text-small border-l-2 pl-3">{t('receipt.corrected_explainer')}</p>
			{/if}

			<div class="grid gap-2">
				<div class="flex items-center justify-between gap-2">
					<Label for="receipt-merchant" class={labelClass}>{t('receipt.merchant')}</Label>
					{@render mark('merchant')}
				</div>
				<Input id="receipt-merchant" bind:value={form.merchant} />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="receipt-total" class={labelClass}>{t('receipt.total')}</Label>
						{@render mark('total')}
					</div>
					<CurrencyInput id="receipt-total" bind:value={form.total} symbol={form.currency} />
					{@render readAs('total')}
					{#if fieldErrors?.amount}
						<p class="text-destructive text-xs">{fieldErrors.amount}</p>
					{/if}
				</div>

				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="receipt-currency" class={labelClass}>{t('receipt.currency')}</Label>
						{@render mark('currency')}
					</div>
					<!-- A currency is not an account: its own picker, so a code
					     does not render behind a bank icon (D79). -->
					<SelectCurrency id="receipt-currency" bind:value={form.currency} />
				</div>
			</div>

			{#if currencyMismatch}
				<p class="text-destructive text-small" role="alert">
					{t('receipt.currency_mismatch', { receipt: form.currency, wallet: walletCurrency })}
				</p>
			{/if}

			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="receipt-subtotal" class={labelClass}>{t('receipt.subtotal')}</Label>
						{@render mark('subtotal')}
					</div>
					<CurrencyInput id="receipt-subtotal" bind:value={form.subtotal} symbol={form.currency} />
					{@render readAs('subtotal')}
				</div>

				<div class="grid gap-2">
					<div class="flex items-center justify-between gap-2">
						<Label for="receipt-tax" class={labelClass}>{t('receipt.tax')}</Label>
						{@render mark('tax')}
					</div>
					<CurrencyInput id="receipt-tax" bind:value={form.tax} symbol={form.currency} />
					{@render readAs('tax')}
				</div>
			</div>

			<p class="text-subtle text-xs">{t('receipt.breakdown_hint')}</p>

			<div class="grid gap-2">
				<div class="flex items-center justify-between gap-2">
					<Label for="receipt-date" class={labelClass}>{t('receipt.date')}</Label>
					{@render mark('date')}
				</div>
				<DatePicker id="receipt-date" bind:value={form.date} />
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-2">
					<Label for="receipt-wallet" class={labelClass}>{t('receipt.wallet')}</Label>
					<SelectAccount id="receipt-wallet" {accounts} bind:value={form.walletId} />
				</div>

				<div class="grid gap-2">
					<Label for="receipt-category" class={labelClass}>{t('receipt.category')}</Label>
					<SelectCategory id="receipt-category" {categories} bind:value={form.categoryId} />
				</div>
			</div>

			{#if form.items.length > 0}
				<div class="space-y-3">
					<div class="flex items-center justify-between gap-2">
						<Label class={labelClass}>{t('receipt.items')}</Label>
						{@render mark('line_items')}
					</div>

					{#each form.items as item, index (index)}
						<div class="grid grid-cols-[1fr_4rem_7rem] items-center gap-2">
							<Input
								bind:value={form.items[index].name}
								aria-label={t('receipt.item_name', { line: index + 1 })}
							/>
							<Input
								bind:value={form.items[index].quantity}
								inputmode="decimal"
								aria-label={t('receipt.item_quantity', { line: index + 1 })}
							/>
							<Input
								bind:value={form.items[index].amount}
								inputmode="decimal"
								class="font-mono"
								aria-label={t('receipt.item_amount', { line: index + 1 })}
							/>
						</div>
					{/each}

					{#if disagrees && linesTotal}
						<!-- A note, never a block: a service charge makes this
						     legitimate (TXN-12). -->
						<p class="text-subtle text-xs">
							{t('receipt.items_mismatch', {
								items: formatMoney(linesTotal, form.currency),
								total: formatMoney(form.total, form.currency)
							})}
						</p>
					{/if}
				</div>
			{/if}

			{#if onManualEntry}
				<Button type="button" variant="ghost" size="sm" onclick={onManualEntry}>
					{t('receipt.manual_entry')}
				</Button>
			{/if}
		</div>

		<!--
			Over the body rather than below it, so the last field scrolls
			under it. Unlike a form sheet this one keeps its cancel: the
			panel is not modal, so there is no overlay to dismiss, and
			cancelling is a decision about the draft rather than about the
			container. It leaves the uploaded file where it is and creates
			nothing (AI-2).
		-->
		<div class="bg-background absolute inset-x-0 bottom-0 flex gap-2 border-t p-6">
			<Button type="button" variant="outline" class="flex-1" onclick={onCancel}>
				{t('common.cancel')}
			</Button>
			<Button type="submit" class="flex-1" loading={saving} disabled={!confirmable}>
				{t('receipt.confirm')}
			</Button>
		</div>
	</form>
{/snippet}

{#if container === 'panel'}
	<!-- The canvas is the container, so the sheet brings only its contents.
	     `relative` is what the footer positions itself against. -->
	<div class="relative h-full">
		{@render body()}
	</div>
{:else}
	<Sheet.Root bind:open {onOpenChange}>
		<Sheet.Content side="right" class="flex h-full flex-col p-0">
			<Sheet.Header class="shrink-0 px-6 pt-6">
				<Sheet.Title class="text-lg">{t('receipt.title')}</Sheet.Title>
				<Sheet.Description class="sr-only">{t('receipt.subtitle')}</Sheet.Description>
			</Sheet.Header>

			{@render body()}
		</Sheet.Content>
	</Sheet.Root>
{/if}
