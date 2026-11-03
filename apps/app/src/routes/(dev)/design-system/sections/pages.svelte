<script lang="ts">
	/**
	 * A whole page, assembled from the organisms.
	 *
	 * This is the specimen the real `(dashboard)/transactions` route copies:
	 * the same header, filter, table, sheets and bulk bar, with mock rows
	 * instead of a load function. Building it here first means the route is a
	 * data problem rather than a layout one.
	 */
	import { TransactionsPage } from '$lib/components/organisms/transactions';
	import type { NamedOption, TransactionRow } from '$lib/components/molecules/data-table';

	let { heading }: { heading: import('svelte').Snippet<[string, string?]> } = $props();

	const categories: NamedOption[] = [
		{ id: 'food', name: 'Food', colorClass: 'bg-red' },
		{ id: 'transport', name: 'Transport', colorClass: 'bg-subtle' },
		{ id: 'shopping', name: 'Shopping', colorClass: 'bg-primary' },
		{ id: 'bills', name: 'Bills', colorClass: 'bg-destructive' },
		{ id: 'salary', name: 'Salary', colorClass: 'bg-green' }
	];

	const wallets: NamedOption[] = [
		{ id: 'cash', name: 'Cash' },
		{ id: 'bca', name: 'BCA' },
		{ id: 'wise', name: 'Wise' }
	];

	const rows: TransactionRow[] = [
		{ id: 'a', day: '2026-11-02', date: '02/11/2026', name: 'Warung Tekko', categoryId: 'food', walletId: 'cash', amount: '-87500', currency: 'IDR', note: 'Lunch with the team. Receipt attached.' },
		{ id: 'b', day: '2026-11-02', date: '02/11/2026', name: 'Gojek', categoryId: 'transport', walletId: 'cash', amount: '-24000', currency: 'IDR', note: 'Ride to the office.' },
		{ id: 'c', day: '2026-11-01', date: '01/11/2026', name: 'Salary', categoryId: 'salary', walletId: 'bca', amount: '9500000', currency: 'IDR', note: 'Monthly salary.' },
		{ id: 'd', day: '2026-11-01', date: '01/11/2026', name: 'Figma', categoryId: 'shopping', walletId: 'wise', amount: '-49.99', currency: 'USD', originalAmount: '-49.99', originalCurrency: 'USD', note: 'Entered in USD, converted at 16.250.' },
		{ id: 'e', day: '2026-10-28', date: '28/10/2026', name: 'Electricity', categoryId: 'bills', walletId: 'bca', amount: '-412000', currency: 'IDR', note: 'October bill.' }
	];
</script>

<section class="space-y-4">
	{@render heading('Transactions page', 'The header with its filter on the left and everything that acts on the table on the right, one line and no page title, as the live page lays it out; the table under it, as wide as the page; and the form sheet, detail sheet, export modal and bulk bar hanging off the page, because they are the page’s state rather than the table’s. Open a row to see the detail sheet, select one to see the bulk bar.')}
	<TransactionsPage {rows} {categories} {wallets} />
</section>

<section class="space-y-4">
	{@render heading('Read only', 'What a member without edit rights sees: no add, no import, export only.')}
	<TransactionsPage rows={rows.slice(0, 2)} {categories} {wallets} canEdit={false} />
</section>
