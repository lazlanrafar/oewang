<script lang="ts">
	/**
	 * A whole page, assembled from the organisms.
	 *
	 * This is the specimen the real `(dashboard)/transactions` route copies:
	 * the same header, filter, table, sheets and bulk bar, with a JSON
	 * fixture instead of a load function. Building it here first means the
	 * route is a data problem rather than a layout one.
	 */
	import { TransactionsPage } from '$lib/components/organisms/transactions';

	import { categories, transactionRows, wallets } from '../mock';
	import Specimen from '../specimen.svelte';
</script>

<Specimen
	title="Transactions page"
	note="The header with its filter on the left and everything that acts on the table on the right, one line and no page title, as the live page lays it out; the table under it, as wide as the page; and the form sheet, detail sheet, export modal and bulk bar hanging off the page, because they are the page’s state rather than the table’s. Open a row to see the detail sheet, select one to see the bulk bar."
	source="organisms/transactions/transactions-page.svelte"
	framed={false}
>
	<TransactionsPage rows={transactionRows} {categories} {wallets} />
</Specimen>

<Specimen
	title="Transactions page, read only"
	note="What a member without edit rights sees: no add, no import, export only."
	framed={false}
>
	<TransactionsPage rows={transactionRows.slice(0, 2)} {categories} {wallets} canEdit={false} />
</Specimen>
