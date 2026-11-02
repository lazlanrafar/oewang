<script lang="ts" module>
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
</script>

<script lang="ts">
	/**
	 * Ported from the old app's transaction-form-sheet, laid out to the rules
	 * in its SHEET_GUIDE: content at `p-0`, a header with no border, a body
	 * that scrolls with `pb-[100px]` so the last field clears the footer, and
	 * a footer absolutely positioned over the body with one full-width submit
	 * and no cancel, because the overlay and Escape already close the sheet.
	 *
	 * Labels are `text-xs font-normal text-muted-foreground` and every control
	 * keeps its default `h-9`, which is what keeps two fields in a row on the
	 * same line.
	 *
	 * Trimmed from 907 lines to this product's fields: the old sheet also
	 * assigns a member and carries budget and quota warnings. The amount is a
	 * decimal string throughout and nothing is converted here (D12, D27).
	 */
	import { Button } from '../../atoms/button/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { Label } from '../../atoms/label/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import * as Tabs from '../../atoms/tabs/index.js';
	import { Textarea } from '../../atoms/textarea/index.js';
	import { CurrencyInput } from '../../molecules/currency-input/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import type { CategoryItem } from '../../molecules/select-category/index.js';
	import type { ComboboxItem } from '../../molecules/combobox/index.js';

	let {
		open = $bindable(false),
		draft = $bindable(),
		accounts,
		categories,
		currencies = ['IDR', 'USD', 'EUR', 'SGD'],
		baseCurrency = 'IDR',
		saving = false,
		onSave,
		onCreateAccount,
		onCreateCategory
	}: {
		open?: boolean;
		draft: TransactionDraft;
		accounts: ComboboxItem[];
		categories: CategoryItem[];
		currencies?: string[];
		baseCurrency?: string;
		saving?: boolean;
		onSave?: (draft: TransactionDraft) => void;
		/** Called with a name typed into the account picker that matched nothing. */
		onCreateAccount?: (name: string) => void;
		onCreateCategory?: (name: string) => void;
	} = $props();

	const editing = $derived(!!draft.id);
	const foreign = $derived(draft.currency !== baseCurrency);
	const symbol = $derived(draft.currency === 'IDR' ? 'Rp' : draft.currency);

	/** The guide's label: small, muted, regular weight. */
	const labelClass = 'text-subtle text-xs font-normal';
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<Sheet.Header class="shrink-0 px-6 pt-6">
			<Sheet.Title class="text-lg">
				{editing ? 'Edit transaction' : 'Create transaction'}
			</Sheet.Title>
			<Sheet.Description class="sr-only">
				{editing ? 'Change this transaction.' : 'Add a transaction by hand.'}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
			<div class="space-y-6">
				<Tabs.Root
					value={draft.type}
					onValueChange={(type) => (draft = { ...draft, type: type as TransactionDraft['type'] })}
				>
					<Tabs.List variant="segmented" class="w-full">
						<Tabs.Trigger value="expense" variant="segmented" class="flex-1">
							Expense
						</Tabs.Trigger>
						<Tabs.Trigger value="income" variant="segmented" class="flex-1">Income</Tabs.Trigger>
						<Tabs.Trigger value="transfer" variant="segmented" class="flex-1">
							Transfer
						</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>

				<div class="grid gap-2">
					<Label for="form-name" class={labelClass}>Description</Label>
					<Input id="form-name" bind:value={draft.name} placeholder="Warung Tekko" autofocus />
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="form-amount" class={labelClass}>Amount</Label>
						<CurrencyInput id="form-amount" bind:value={draft.amount} {symbol} />
					</div>
					<div class="grid gap-2">
						<Label for="form-currency" class={labelClass}>Currency</Label>
						<SelectAccount
							id="form-currency"
							accounts={currencies.map((code) => ({ id: code, label: code }))}
							bind:value={draft.currency}
							placeholder="Currency"
						/>
					</div>
				</div>

				{#if foreign}
					<div class="grid gap-2">
						<Label for="form-rate" class={labelClass}>Rate to {baseCurrency}</Label>
						<Input id="form-rate" bind:value={draft.exchangeRate} class="font-mono" />
						<p class="text-subtle text-xs">
							The API converts with this rate and stores both amounts.
						</p>
					</div>
				{/if}

				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="form-account" class={labelClass}>
							{draft.type === 'transfer' ? 'From account' : 'Account'}
						</Label>
						<SelectAccount
							id="form-account"
							{accounts}
							bind:value={draft.accountId}
							onCreate={onCreateAccount}
						/>
					</div>
					{#if draft.type === 'transfer'}
						<div class="grid gap-2">
							<Label for="form-to-account" class={labelClass}>To account</Label>
							<SelectAccount
								id="form-to-account"
								{accounts}
								bind:value={draft.toAccountId}
								onCreate={onCreateAccount}
							/>
						</div>
					{:else}
						<div class="grid gap-2">
							<Label for="form-category" class={labelClass}>Category</Label>
							<SelectCategory
								id="form-category"
								{categories}
								bind:value={draft.categoryId}
								onCreate={onCreateCategory}
							/>
						</div>
					{/if}
				</div>

				<div class="grid gap-2">
					<Label for="form-date" class={labelClass}>Date</Label>
					<Input id="form-date" type="date" bind:value={draft.date} />
				</div>

				<div class="grid gap-2">
					<Label for="form-notes" class={labelClass}>Notes</Label>
					<Textarea id="form-notes" bind:value={draft.notes} rows={3} placeholder="Optional" />
				</div>
			</div>
		</div>

		<!-- Over the body rather than below it, with no rule: the guide's
		     footer, so the last field scrolls under it cleanly. -->
		<div class="bg-background absolute inset-x-0 bottom-0 p-6">
			<Button class="w-full" loading={saving} onclick={() => onSave?.(draft)}>
				{editing ? 'Save changes' : 'Create transaction'}
			</Button>
		</div>
	</Sheet.Content>
</Sheet.Root>
