<script lang="ts" module>
	export type TransactionDraft = {
		id?: string;
		type: 'expense' | 'income' | 'transfer';
		name: string;
		/** Decimal string, unsigned: the type carries the direction. */
		amount: string;
		/** The currency the user is typing in, which may differ from the wallet's. */
		currency: string;
		/** Entry currency to wallet currency. Empty when the two are the same. */
		exchangeRate: string;
		/** Wallet currency to workspace currency, for a foreign wallet. */
		baseRate: string;
		accountId: string;
		toAccountId: string;
		toAmount: string;
		categoryId: string;
		date: string;
		notes: string;
		isReady: boolean;
	};

	export const emptyDraft = (
		walletId = '',
		currency = 'IDR',
		categoryId = ''
	): TransactionDraft => ({
		type: 'expense',
		name: '',
		amount: '',
		currency,
		exchangeRate: '',
		baseRate: '',
		accountId: walletId,
		toAccountId: '',
		toAmount: '',
		categoryId,
		date: new Date().toISOString().slice(0, 10),
		notes: '',
		isReady: false
	});
</script>

<script lang="ts">
	/**
	 * The transaction form's fields, with nothing around them.
	 *
	 * One field set, two containers: the sheet renders it with the rich
	 * pickers, and the page renders it inside `<noscript>` as a plain form
	 * with native controls. Writing the fields twice would mean two places
	 * to keep a validation rule, and the plain one would be the one that
	 * rots.
	 *
	 * Every amount is a string from the input to the API. Nothing here calls
	 * `parseFloat`, and nothing here converts: the API computes
	 * `base_amount` and refuses to take one (D12, D27).
	 */
	import { formatMoney, multiplyDecimals } from '$lib/money.js';
	import { Checkbox } from '../../atoms/checkbox/index.js';
	import { FileDropzone, type UploadedFile } from '../../molecules/file-dropzone/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { Label } from '../../atoms/label/index.js';
	import * as Tabs from '../../atoms/tabs/index.js';
	import { Textarea } from '../../atoms/textarea/index.js';
	import { CurrencyInput } from '../../molecules/currency-input/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import type { CategoryItem } from '../../molecules/select-category/index.js';
	import type { ComboboxItem } from '../../molecules/combobox/index.js';

	let {
		draft = $bindable(),
		accounts,
		categories,
		currencies = ['IDR', 'USD', 'EUR', 'SGD'],
		/** The workspace currency. Every total is expressed in it. */
		baseCurrency = 'IDR',
		/** The currency the chosen wallet holds, which `amount` moves. */
		walletCurrency = baseCurrency,
		/** A rate suggestion for the form, or null while none is known. */
		suggestedRate = null,
		plain = false,
		attachments = $bindable([]),
		fieldErrors,
		onCreateAccount,
		onCreateCategory
	}: {
		draft: TransactionDraft;
		accounts: ComboboxItem[];
		categories: CategoryItem[];
		currencies?: string[];
		baseCurrency?: string;
		walletCurrency?: string;
		suggestedRate?: string | null;
		/** Native controls only, for the no-JavaScript form. */
		plain?: boolean;
		/** The files this transaction carries (TXN-13). */
		attachments?: UploadedFile[];
		fieldErrors?: Record<string, string>;
		onCreateAccount?: (name: string) => void;
		onCreateCategory?: (name: string) => void;
	} = $props();

	const transfer = $derived(draft.type === 'transfer');
	/** The user typed in a currency the wallet does not hold (TXN-20). */
	const foreignEntry = $derived(draft.currency !== walletCurrency);
	/** The wallet itself is foreign to the workspace, so a base rate is needed. */
	const foreignWallet = $derived(walletCurrency !== baseCurrency);

	/**
	 * What the entered figure becomes in the wallet's currency, shown live
	 * while the rate is typed.
	 *
	 * This is a preview, not the number that is stored: the API computes the
	 * figure it writes and refuses one sent by the client. Showing it here
	 * is what lets a user notice a rate that is out by a factor of ten before
	 * they save, rather than after.
	 */
	const convertedAmount = $derived.by(() => {
		if (!foreignEntry || !draft.amount || !draft.exchangeRate) return null;
		try {
			return multiplyDecimals(draft.amount, draft.exchangeRate);
		} catch {
			// Half-typed input is not an error worth showing.
			return null;
		}
	});

	const labelClass = 'text-subtle text-xs font-normal';
	const selectClass = 'border-input bg-background h-9 w-full border px-3 text-sm';
</script>

<!--
	Hidden inputs carry what the rich pickers hold, because a combobox is a
	button and a button submits nothing. In the plain form the visible
	controls carry their own names and these are not rendered.
-->
{#if !plain}
	<input type="hidden" name="type" value={draft.type} />
	<input type="hidden" name="wallet_id" value={draft.accountId} />
	<input type="hidden" name="to_wallet_id" value={transfer ? draft.toAccountId : ''} />
	<input type="hidden" name="category_id" value={transfer ? '' : draft.categoryId} />
	<input type="hidden" name="is_ready" value={draft.isReady ? 'true' : 'false'} />
{/if}

<!--
	The three foreign-entry columns travel together or not at all. When the
	entry currency matches the wallet's they are empty, and the API stores
	nothing.
-->
<input
	type="hidden"
	name="original_amount"
	value={foreignEntry && draft.amount ? draft.amount : ''}
/>
<!--
	`amount` is always in the wallet's currency, because that is what moves
	the balance. When the entry currency differed, what the user typed goes
	to `original_amount` above and the converted figure is submitted here.
-->
{#if foreignEntry}
	<input type="hidden" name="amount" value={convertedAmount ?? ''} />
{/if}
<input type="hidden" name="original_currency_code" value={foreignEntry ? draft.currency : ''} />
<input type="hidden" name="exchange_rate" value={foreignEntry ? draft.exchangeRate : ''} />
<input type="hidden" name="base_rate" value={foreignWallet ? draft.baseRate : ''} />

<div class="space-y-6">
	{#if plain}
		<div class="grid gap-2">
			<Label for="form-type" class={labelClass}>Type</Label>
			<select id="form-type" name="type" class={selectClass} bind:value={draft.type}>
				<option value="expense">Expense</option>
				<option value="income">Income</option>
				<option value="transfer">Transfer</option>
			</select>
		</div>
	{:else}
		<Tabs.Root
			value={draft.type}
			onValueChange={(type) => (draft = { ...draft, type: type as TransactionDraft['type'] })}
		>
			<Tabs.List variant="segmented" class="w-full">
				<Tabs.Trigger value="expense" variant="segmented" class="flex-1">Expense</Tabs.Trigger>
				<Tabs.Trigger value="income" variant="segmented" class="flex-1">Income</Tabs.Trigger>
				<Tabs.Trigger value="transfer" variant="segmented" class="flex-1">Transfer</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	{/if}

	<div class="grid gap-2">
		<Label for="form-name" class={labelClass}>Description</Label>
		<Input id="form-name" name="name" bind:value={draft.name} placeholder="Warung Tekko" />
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div class="grid gap-2">
			<Label for="form-amount" class={labelClass}>Amount</Label>
			{#if plain}
				<Input
					id="form-amount"
					name={foreignEntry ? 'typed_amount' : 'amount'}
					required
					bind:value={draft.amount}
					inputmode="decimal"
				/>
			{:else}
				<!-- The hidden input is what submits: the currency input groups
				     its display and the grouped text is not a number. -->
				<CurrencyInput id="form-amount" bind:value={draft.amount} symbol={draft.currency} />
				{#if !foreignEntry}
					<input type="hidden" name="amount" value={draft.amount} />
				{/if}
			{/if}
			{#if fieldErrors?.amount}
				<p class="text-destructive text-xs">{fieldErrors.amount}</p>
			{/if}
		</div>

		<div class="grid gap-2">
			<Label for="form-currency" class={labelClass}>Currency</Label>
			{#if plain}
				<select id="form-currency" class={selectClass} bind:value={draft.currency}>
					{#each currencies as code (code)}<option value={code}>{code}</option>{/each}
				</select>
			{:else}
				<SelectAccount
					id="form-currency"
					accounts={currencies.map((code) => ({ id: code, label: code }))}
					bind:value={draft.currency}
					placeholder="Currency"
				/>
			{/if}
		</div>
	</div>

	{#if foreignEntry}
		<div class="grid gap-2">
			<Label for="form-rate" class={labelClass}>
				Rate, 1 {draft.currency} to {walletCurrency}
			</Label>
			<Input id="form-rate" bind:value={draft.exchangeRate} class="font-mono" inputmode="decimal" />
			{#if convertedAmount}
				<p class="text-body font-mono">
					{formatMoney(draft.amount, draft.currency)} =
					{formatMoney(convertedAmount, walletCurrency)}
				</p>
			{/if}
			<p class="text-subtle text-xs">
				That figure is what leaves the wallet. It is a preview: the API computes and stores
				its own, from the amount and the rate.
			</p>
		</div>
	{/if}

	{#if foreignWallet}
		<div class="grid gap-2">
			<Label for="form-base-rate" class={labelClass}>
				Rate, 1 {walletCurrency} to {baseCurrency}
			</Label>
			<Input
				id="form-base-rate"
				bind:value={draft.baseRate}
				class="font-mono"
				inputmode="decimal"
				placeholder={suggestedRate ?? ''}
			/>
			<p class="text-subtle text-xs">
				{#if suggestedRate}
					Suggested: {suggestedRate}. Edit it if your bank used another.
				{:else}
					No rate is available for today. Enter the one your bank used.
				{/if}
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-4">
		<div class="grid gap-2">
			<Label for="form-account" class={labelClass}>
				{transfer ? 'From account' : 'Account'}
			</Label>
			{#if plain}
				<select id="form-account" name="wallet_id" class={selectClass} bind:value={draft.accountId}>
					{#each accounts as account (account.id)}
						<option value={account.id}>{account.label}</option>
					{/each}
				</select>
			{:else}
				<SelectAccount
					id="form-account"
					{accounts}
					bind:value={draft.accountId}
					onCreate={onCreateAccount}
				/>
			{/if}
		</div>

		{#if transfer}
			<div class="grid gap-2">
				<Label for="form-to-account" class={labelClass}>To account</Label>
				{#if plain}
					<select
						id="form-to-account"
						name="to_wallet_id"
						class={selectClass}
						bind:value={draft.toAccountId}
					>
						<option value="">Select</option>
						{#each accounts as account (account.id)}
							<option value={account.id}>{account.label}</option>
						{/each}
					</select>
				{:else}
					<SelectAccount
						id="form-to-account"
						{accounts}
						bind:value={draft.toAccountId}
						onCreate={onCreateAccount}
					/>
				{/if}
			</div>
		{:else}
			<div class="grid gap-2">
				<Label for="form-category" class={labelClass}>Category</Label>
				{#if plain}
					<select
						id="form-category"
						name="category_id"
						class={selectClass}
						bind:value={draft.categoryId}
					>
						<option value="">None</option>
						{#each categories as category (category.id)}
							<option value={category.id}>{category.label}</option>
						{/each}
					</select>
				{:else}
					<SelectCategory
						id="form-category"
						{categories}
						bind:value={draft.categoryId}
						onCreate={onCreateCategory}
					/>
				{/if}
			</div>
		{/if}
	</div>

	{#if transfer}
		<!--
			A transfer moves two figures: `amount` out of the source in its
			currency, `to_amount` into the destination in its own (TXN-18).
			Same-currency transfers repeat the figure, which is what the old
			app did implicitly.
		-->
		<div class="grid gap-2">
			<Label for="form-to-amount" class={labelClass}>Amount received</Label>
			<Input
				id="form-to-amount"
				name="to_amount"
				bind:value={draft.toAmount}
				inputmode="decimal"
				placeholder={draft.amount}
			/>
			<p class="text-subtle text-xs">
				What arrives in the destination wallet, in its own currency. Leave it the same for a
				transfer between two wallets in one currency.
			</p>
		</div>
	{/if}

	<div class="grid gap-2">
		<Label for="form-date" class={labelClass}>Date</Label>
		<Input id="form-date" name="date" type="date" required bind:value={draft.date} />
	</div>

	<div class="grid gap-2">
		<Label for="form-notes" class={labelClass}>Notes</Label>
		<Textarea
			id="form-notes"
			name="description"
			bind:value={draft.notes}
			rows={3}
			placeholder="Optional"
		/>
	</div>

	{#if !plain}
		<!--
			Files upload on drop, so the form submits ids rather than bytes.
			Absent from the no-script form: an upload needs script, and a
			form that silently dropped the file would be worse than one that
			does not offer it.
		-->
		<div class="grid gap-2">
			<Label class={labelClass}>Attachments</Label>
			<FileDropzone bind:files={attachments} />
		</div>
	{/if}

	<div class="flex items-center gap-2">
		{#if plain}
			<input
				id="form-ready"
				type="checkbox"
				name="is_ready"
				value="true"
				checked={draft.isReady}
			/>
		{:else}
			<Checkbox id="form-ready" bind:checked={draft.isReady} />
		{/if}
		<Label for="form-ready">Mark as ready</Label>
	</div>
</div>
