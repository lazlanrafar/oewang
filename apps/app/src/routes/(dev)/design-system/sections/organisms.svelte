<script lang="ts">
	/**
	 * Whole features, built from molecules and atoms.
	 *
	 * The transactions table is the one this product needs first (US-017). It
	 * lives beside the page while it is a specimen with mock rows; it moves
	 * into `$lib/components/organisms` when it takes real data.
	 */
	import TransactionsTable from '../transactions-table.svelte';

	let { heading }: { heading: import('svelte').Snippet<[string, string?]> } = $props();
</script>

<section class="space-y-4">
	{@render heading('Transactions table', 'Search, grouping, a date range, column visibility, export, sortable headers, selection with a bulk bar, day group rows with that day’s totals, a row that expands in place, the in-cell category editor, a row-actions menu and a footer count.')}
	<TransactionsTable />
</section>
