<script lang="ts">
	/**
	 * Ported from the old app's transaction-form-sheet, trimmed to this
	 * product's fields: the old one also assigns a member and carries budget
	 * and quota warnings, which are out of scope.
	 *
	 * The amount is a decimal string the whole way through (D12). A foreign
	 * currency asks for its rate rather than converting here, because the API
	 * is the only thing allowed to do that arithmetic (D27).
	 *
	 * The sheet holds no data: a page passes the accounts and categories in
	 * and gets a draft back on save.
	 */
	import { Button } from '../../atoms/button/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { Textarea } from '../../atoms/textarea/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import * as Tabs from '../../atoms/tabs/index.js';
	import * as Field from '../../molecules/field/index.js';
	import { CurrencyInput } from '../../molecules/currency-input/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import type { CategoryItem } from '../../molecules/select-category/index.js';
	import type { ComboboxItem } from '../../molecules/combobox/index.js';

	export type TransactionDraft = {
		id?: string;
		type: 'expense' | 'income' | 'transfer';
		name: string;
		/** Decimal string, unsigned: the type carries the direction. */
		amount: string;
		currency: string;
		exchangeRate: string;
		accountId: string;
		toAccountId: string;
		categoryId: string;
		date: string;
		notes: string;
	};

	let {
		open = $bindable(false),
		draft = $bindable(),
		accounts,
		categories,
		currencies = ['IDR', 'USD', 'EUR', 'SGD'],
		baseCurrency = 'IDR',
		saving = false,
		onSave
	}: {
		open?: boolean;
		draft: TransactionDraft;
		accounts: ComboboxItem[];
		categories: CategoryItem[];
		currencies?: string[];
		baseCurrency?: string;
		saving?: boolean;
		onSave?: (draft: TransactionDraft) => void;
	} = $props();

	const editing = $derived(!!draft.id);
	const foreign = $derived(draft.currency !== baseCurrency);
	const symbol = $derived(draft.currency === 'IDR' ? 'Rp' : draft.currency);
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title class="text-h2">
				{editing ? 'Edit transaction' : 'New transaction'}
			</Sheet.Title>
			<Sheet.Description>
				{editing ? 'Changes are saved to this transaction.' : 'Add one by hand.'}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 overflow-y-auto px-4">
			<Tabs.Root
				value={draft.type}
				onValueChange={(type) => (draft = { ...draft, type: type as TransactionDraft['type'] })}
			>
				<Tabs.List variant="segmented" class="w-full">
					<Tabs.Trigger value="expense" variant="segmented" class="flex-1">Expense</Tabs.Trigger>
					<Tabs.Trigger value="income" variant="segmented" class="flex-1">Income</Tabs.Trigger>
					<Tabs.Trigger value="transfer" variant="segmented" class="flex-1">
						Transfer
					</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>

			<Field.Group class="mt-6 gap-5">
				<Field.Root>
					<Field.Label for="form-name">Description</Field.Label>
					<Input id="form-name" bind:value={draft.name} placeholder="Warung Tekko" />
				</Field.Root>

				<div class="grid grid-cols-[1fr_auto] gap-3">
					<Field.Root>
						<Field.Label for="form-amount">Amount</Field.Label>
						<CurrencyInput id="form-amount" bind:value={draft.amount} {symbol} />
					</Field.Root>
					<Field.Root class="w-28">
						<Field.Label for="form-currency">Currency</Field.Label>
						<SelectAccount
							id="form-currency"
							accounts={currencies.map((code) => ({ id: code, label: code }))}
							bind:value={draft.currency}
							placeholder="Currency"
						/>
					</Field.Root>
				</div>

				{#if foreign}
					<Field.Root>
						<Field.Label for="form-rate">Rate to {baseCurrency}</Field.Label>
						<Input id="form-rate" bind:value={draft.exchangeRate} class="font-mono" />
						<Field.Description>
							The API converts with this rate and stores both amounts; nothing is
							converted here.
						</Field.Description>
					</Field.Root>
				{/if}

				<Field.Root>
					<Field.Label for="form-account">{draft.type === 'transfer' ? 'From account' : 'Account'}</Field.Label>
					<SelectAccount id="form-account" {accounts} bind:value={draft.accountId} />
				</Field.Root>

				{#if draft.type === 'transfer'}
					<Field.Root>
						<Field.Label for="form-to-account">To account</Field.Label>
						<SelectAccount id="form-to-account" {accounts} bind:value={draft.toAccountId} />
					</Field.Root>
				{:else}
					<Field.Root>
						<Field.Label for="form-category">Category</Field.Label>
						<SelectCategory id="form-category" {categories} bind:value={draft.categoryId} />
					</Field.Root>
				{/if}

				<Field.Root>
					<Field.Label for="form-date">Date</Field.Label>
					<Input id="form-date" type="date" bind:value={draft.date} />
				</Field.Root>

				<Field.Root>
					<Field.Label for="form-notes">Notes</Field.Label>
					<Textarea id="form-notes" bind:value={draft.notes} rows={3} placeholder="Optional" />
				</Field.Root>
			</Field.Group>
		</div>

		<Sheet.Footer class="flex-row justify-end gap-2">
			<Sheet.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Cancel</Button>
				{/snippet}
			</Sheet.Close>
			<Button loading={saving} onclick={() => onSave?.(draft)}>
				{editing ? 'Save changes' : 'Add transaction'}
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
