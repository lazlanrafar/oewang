<script lang="ts">
	/** Atoms combined into one job: a field, an empty state, a row, a money box. */
	import Inbox from '@lucide/svelte/icons/inbox';
	import Search from '@lucide/svelte/icons/search';
	import Wallet from '@lucide/svelte/icons/wallet';

	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Input } from '$lib/components/atoms/input';
	import { Switch } from '$lib/components/atoms/switch';
	import * as ButtonGroup from '$lib/components/molecules/button-group';
	import { Combobox } from '$lib/components/molecules/combobox';
	import { SelectAccount } from '$lib/components/molecules/select-account';
	import { SelectCategory } from '$lib/components/molecules/select-category';
	import { CurrencyInput } from '$lib/components/molecules/currency-input';
	import * as Empty from '$lib/components/molecules/empty';
	import * as Field from '$lib/components/molecules/field';
	import * as InputGroup from '$lib/components/molecules/input-group';
	import * as Item from '$lib/components/molecules/item';
	import { StatCard } from '$lib/components/molecules/stat-card';

	let { heading }: { heading: import('svelte').Snippet<[string, string?]> } = $props();

	const categories = [
		{ id: 'food', label: 'Food', colorClass: 'bg-red' },
		{ id: 'transport', label: 'Transport', colorClass: 'bg-subtle' },
		{ id: 'shopping', label: 'Shopping', colorClass: 'bg-primary' },
		{ id: 'bills', label: 'Bills', colorClass: 'bg-destructive' },
		{ id: 'salary', label: 'Salary', colorClass: 'bg-green' }
	];
	const accounts = [
		{ id: 'cash', label: 'Cash' },
		{ id: 'bca', label: 'BCA' },
		{ id: 'wise', label: 'Wise' }
	];
	let picked = $state('food');
	let account = $state('bca');
	let amount = $state('87500');
	let notify = $state(true);
</script>

<section class="space-y-4">
	{@render heading('Field', 'A label, a control, a description and an error, as one unit.')}
	<Field.Group class="max-w-lg">
		<Field.Root>
			<Field.Label for="field-name">Description</Field.Label>
			<Input id="field-name" placeholder="Warung Tekko" />
			<Field.Description>What the money was for.</Field.Description>
		</Field.Root>

		<Field.Root invalid>
			<Field.Label for="field-amount">Amount</Field.Label>
			<Input id="field-amount" aria-invalid="true" value="-" class="font-mono" />
			<Field.Error>Enter an amount greater than zero.</Field.Error>
		</Field.Root>

		<Field.Root orientation="horizontal">
			<Field.Label for="field-notify">Email me a receipt</Field.Label>
			<Switch id="field-notify" bind:checked={notify} />
		</Field.Root>

		<Field.Separator>or</Field.Separator>

		<Field.Root orientation="horizontal">
			<Checkbox id="field-recurring" />
			<Field.Label for="field-recurring">Repeat every month</Field.Label>
		</Field.Root>
	</Field.Group>
</section>

<section class="space-y-4">
	{@render heading('Input group and currency input')}
	<div class="grid gap-4 sm:grid-cols-2">
		<InputGroup.Root>
			<InputGroup.Addon><Search /></InputGroup.Addon>
			<InputGroup.Input placeholder="Search transactions" />
		</InputGroup.Root>
		<InputGroup.Root>
			<InputGroup.Addon><InputGroup.Text>Rp</InputGroup.Text></InputGroup.Addon>
			<InputGroup.Input placeholder="0" inputmode="decimal" class="font-mono" />
			<InputGroup.Addon align="inline-end"><InputGroup.Text>IDR</InputGroup.Text></InputGroup.Addon>
		</InputGroup.Root>
		<InputGroup.Root class="sm:col-span-2">
			<InputGroup.Textarea placeholder="A longer note" rows={2} />
			<InputGroup.Addon align="block-end">
				<InputGroup.Button size="sm">Attach receipt</InputGroup.Button>
			</InputGroup.Addon>
		</InputGroup.Root>
		<div class="space-y-2">
			<CurrencyInput bind:value={amount} />
			<p class="text-subtle text-small">
				Bound value: <code class="font-mono">{amount || '(empty)'}</code>. A decimal string,
				never a number (D12).
			</p>
		</div>
		<div class="space-y-2">
			<Combobox items={categories} bind:value={picked} />
			<p class="text-subtle text-small">A button that opens a searchable list.</p>
		</div>
	</div>
</section>

<section class="space-y-4">
	{@render heading('Account and category pickers', 'The two the transactions table puts in its cells. In a table they are borderless, fill the cell and keep their chevron at the right edge; outside one they are an ordinary outlined control.')}
	<div class="grid gap-4 sm:grid-cols-2">
		<SelectAccount {accounts} bind:value={account} />
		<SelectCategory {categories} bind:value={picked} />
		<div class="border">
			<div class="flex h-[45px] items-center border-b">
				<div class="w-48 border-r px-4 text-subtle text-small">In a data table cell</div>
				<div class="h-full flex-1"><SelectAccount {accounts} bind:value={account} inDataTable /></div>
			</div>
			<div class="flex h-[45px] items-center">
				<div class="w-48 border-r px-4 text-subtle text-small">With a colour square</div>
				<div class="h-full flex-1">
					<SelectCategory {categories} bind:value={picked} inDataTable />
				</div>
			</div>
		</div>
		<div class="border">
			<div class="flex h-[45px] items-center border-b">
				<div class="w-48 border-r px-4 text-subtle text-small">While saving</div>
				<div class="h-full flex-1">
					<SelectAccount {accounts} value={account} inDataTable updating />
				</div>
			</div>
			<div class="flex h-[45px] items-center">
				<div class="w-48 border-r px-4 text-subtle text-small">Disabled</div>
				<div class="h-full flex-1">
					<SelectCategory {categories} value={picked} inDataTable disabled />
				</div>
			</div>
		</div>
	</div>
</section>

<section class="space-y-4">
	{@render heading('Button group')}
	<div class="flex flex-wrap items-center gap-6">
		<ButtonGroup.Root>
			<Button variant="outline">Day</Button>
			<Button variant="outline">Week</Button>
			<Button variant="outline">Month</Button>
		</ButtonGroup.Root>
		<ButtonGroup.Root>
			<ButtonGroup.Text>https://</ButtonGroup.Text>
			<Input class="w-48" value="oewang.com" />
			<Button variant="outline">Check</Button>
		</ButtonGroup.Root>
	</div>
</section>

<section class="space-y-4">
	{@render heading('Item', 'The settings and picker rows.')}
	<Item.Group class="max-w-xl border">
		{#each [['Cash', 'Rp 412.000'], ['BCA', 'Rp 8.976.500'], ['Wise', '$120,10']] as [name, balance] (name)}
			<Item.Root class="border-b last:border-b-0">
				<Item.Media><Wallet /></Item.Media>
				<Item.Content>
					<Item.Title>{name}</Item.Title>
					<Item.Description>Updated 2 minutes ago</Item.Description>
				</Item.Content>
				<Item.Actions>
					<span class="font-mono">{balance}</span>
					<Button size="sm" variant="ghost">Edit</Button>
				</Item.Actions>
			</Item.Root>
		{/each}
	</Item.Group>
</section>

<section class="space-y-4">
	{@render heading('Empty state')}
	<Empty.Root class="max-w-xl">
		<Empty.Header>
			<Empty.Media><Inbox /></Empty.Media>
			<Empty.Title>No transactions yet</Empty.Title>
			<Empty.Description>
				Add one by hand, import a statement, or forward a receipt to the assistant.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button>Add transaction</Button>
		</Empty.Content>
	</Empty.Root>
</section>

<section class="space-y-4">
	{@render heading('Stat card', 'The value is formatted by the caller; this component never does arithmetic on money.')}
	<div class="grid gap-4 sm:grid-cols-3">
		<StatCard label="Income" value="Rp 9.500.000" change={12} changeLabel="vs last month" />
		<StatCard label="Expenses" value="Rp 111.500" change={-4} changeLabel="vs last month" />
		<StatCard label="Net" value="Rp 9.388.500" loading />
	</div>
</section>
