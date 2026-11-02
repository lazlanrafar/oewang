<script lang="ts">
	/**
	 * Whole features, built from molecules and atoms.
	 *
	 * The rows here are mock, and the table takes them as a prop: the
	 * component itself holds no data and fetches nothing, which is what lets
	 * it be shown on a page with no server behind it.
	 */
	import { TransactionsTable } from '$lib/components/organisms/data-table';
	import type { NamedOption, TransactionRow } from '$lib/components/organisms/data-table';

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
	{@render heading('Transactions table', 'The advanced filter with its date range, grouping by day with that day’s totals, sortable columns, column visibility, selection with a bulk bar, a row that expands on click or chevron, the in-cell category editor, a row-actions menu and a footer count.')}
	<TransactionsTable {rows} {categories} {wallets} />
</section>

<section class="space-y-4">
	{@render heading('Empty', 'The same table with every row filtered out.')}
	<TransactionsTable rows={[]} {categories} {wallets} />
</section>
