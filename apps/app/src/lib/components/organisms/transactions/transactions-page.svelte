<script lang="ts">
	/**
	 * The whole transactions page, composed from the pieces beside it.
	 *
	 * This is the shape US-017 to US-022 will fill in: the header carries the
	 * filter, the grouping, the date range, column visibility, the import and
	 * export menu and the add button, exactly as the old
	 * `transaction-client-header` arranges them; the table sits under it; and
	 * the sheets, the modal and the bulk bar hang off the page rather than off
	 * the table, because they are the page's state.
	 *
	 * It holds no data and fetches nothing. Rows, accounts and categories come
	 * in as props, and every action is a callback, so the page that mounts it
	 * decides what a save or a delete means.
	 */
	import { tick } from 'svelte';

	import { absDecimal, formatMoney, isNegative } from '$lib/money.js';

	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import FileDown from '@lucide/svelte/icons/file-down';
	import FileUp from '@lucide/svelte/icons/file-up';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Plus from '@lucide/svelte/icons/plus';
	import ScanLine from '@lucide/svelte/icons/scan-line';

	import { Button } from '../../atoms/button/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import { DateRangePicker } from '../../molecules/date-range-picker/index.js';
	import { DataTableFilter } from '../../molecules/data-table-filter/index.js';
	import { Select } from '../../molecules/select/index.js';
	import { emptyFilterState, type DataTableFilterState } from '../../molecules/data-table-filter/index.js';
	import type { NamedOption } from '../../molecules/data-table/index.js';
	import TransactionsDataTable from './transactions-data-table.svelte';
	import { TRANSACTION_COLUMNS, type ColumnKey } from './transactions-data-table-column.js';
	import { GROUPINGS, type Grouping } from './transactions-data-table-grouping.js';
	import type { TransactionRow } from './transactions-data-table-types.js';
	import TransactionBulkBar from './transactions-bulk-bar.svelte';
	import TransactionDetailSheet from './transactions-detail-sheet.svelte';
	import TransactionExportModal from './transactions-export-modal.svelte';
	import TransactionFormSheet from './transactions-form-sheet.svelte';
	import { emptyDraft, type TransactionDraft } from './transactions-form-fields.svelte';

	let {
		rows,
		categories = $bindable(),
		wallets = $bindable(),
		canEdit = true
	}: {
		rows: TransactionRow[];
		categories: NamedOption[];
		wallets: NamedOption[];
		canEdit?: boolean;
	} = $props();

	let filters = $state<DataTableFilterState>(emptyFilterState());

	/**
	 * Which columns are off. Held here rather than in the table because the
	 * menu that changes it sits in this page's header, where the live app
	 * puts it.
	 */
	let hiddenColumns = $state<Partial<Record<ColumnKey, boolean>>>({});

	const hideableColumns = TRANSACTION_COLUMNS.filter((column) => !column.fixed);
	let grouping = $state<Grouping>('daily');

	/** The specimen's own words; the route reads these from the dictionary. */
	const GROUPING_LABEL: Record<Grouping, string> = {
		none: 'None',
		daily: 'Daily',
		weekly: 'Weekly',
		monthly: 'Monthly'
	};
	let selectedIds = $state<string[]>([]);

	let formOpen = $state(false);
	let detailOpen = $state(false);
	let exportOpen = $state(false);
	let detailRow = $state<TransactionRow | null>(null);

	const freshDraft = (): TransactionDraft =>
		emptyDraft(wallets[0]?.id ?? '', 'IDR', categories[0]?.id ?? '');

	let draft = $state<TransactionDraft>(freshDraft());

	/** A slug is good enough for a specimen; a real page takes the API's id. */
	const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

	function createAccount(name: string) {
		const id = slug(name);
		wallets = [...wallets, { id, name }];
		draft = { ...draft, accountId: id };
	}

	function createCategory(name: string) {
		const id = slug(name);
		categories = [...categories, { id, name, colorClass: 'bg-subtle' }];
		draft = { ...draft, categoryId: id };
	}

	const accountItems = $derived(wallets.map((w) => ({ id: w.id, label: w.name })));
	const categoryItems = $derived(
		categories.map((c) => ({ id: c.id, label: c.name, colorClass: c.colorClass }))
	);
	const nameOf = (options: NamedOption[], id: string) =>
		options.find((option) => option.id === id)?.name ?? id;

	const detail = $derived(
		detailRow
			? {
					id: detailRow.id,
					name: detailRow.name,
					amount: formatMoney(detailRow.amount, detailRow.currency, { signed: true }),
					income: !isNegative(detailRow.amount),
					date: detailRow.date,
					account: nameOf(wallets, detailRow.walletId),
					category: nameOf(categories, detailRow.categoryId),
					type: isNegative(detailRow.amount) ? 'expense' : 'income',
					ready: false,
					notes: detailRow.note,
					baseAmount: formatMoney(detailRow.amount, detailRow.currency),
					items: [
						{ id: 'i1', name: 'Nasi goreng', amount: 'Rp 35.000', quantity: '1', unit: 'pcs' }
					],
					itemsMismatch: 'Rp 35.000 of Rp 87.500',
					// A specimen shows the shape; the real sheet fetches the
					// bytes as chunks.
					attachments: [],
					history: [
						{ id: 'h1', at: '02/11/2026 09:14', who: 'you', source: 'web', what: 'created this transaction' },
						{ id: 'h2', at: '02/11/2026 09:15', who: 'the assistant', source: 'chat', what: 'set the category to Food' }
					]
				}
			: undefined
	);

	function openNew() {
		draft = freshDraft();
		formOpen = true;
	}

	/**
	 * Two sheets cannot be open at once, and opening the second in the same
	 * tick as closing the first leaves both shut: the overlay the first is
	 * still unmounting swallows the second. So the detail closes, the DOM
	 * settles, and the form opens after it.
	 */
	async function openEditFromDetail() {
		if (!detailRow) return;
		draft = {
			...freshDraft(),
			id: detailRow.id,
			type: isNegative(detailRow.amount) ? 'expense' : 'income',
			name: detailRow.name,
			amount: absDecimal(detailRow.amount),
			currency: detailRow.currency,
			accountId: detailRow.walletId,
			categoryId: detailRow.categoryId,
			date: detailRow.day,
			notes: detailRow.note ?? ''
		};
		// The sheet closes itself; this waits for the overlay to finish
		// unmounting before the form takes its place.
		await tick();
		setTimeout(() => (formOpen = true), 260);
	}
</script>

<div class="flex flex-col gap-4">
	<!--
		The header, laid out as the live page lays it out: the search on the
		left, everything that acts on the table on the right, one line. There
		is no page title. The sidebar already says which page this is, and a
		heading repeating it costs a line of the table's height on every
		screen.
	-->
	<!--
		The heading stays for anyone navigating by headings; only its ink is
		gone. A page whose only `h1` is deleted leaves a screen-reader user
		with no landmark for what they are on, and the sidebar's current item
		is a link, not a heading (UI-6).
	-->
	<h1 class="sr-only">Transactions</h1>

	<div class="flex shrink-0 items-center justify-between gap-4">
		<!-- The search takes the line; everything that acts on the table sits
		     at the far end. One row, as the old header is one row. -->
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters
				facets={[
					{ id: 'category', label: 'Category', options: categories },
					{ id: 'wallet', label: 'Account', options: wallets }
				]}
				placeholder="Search transactions"
				showDate={false}
				class="w-full"
			/>
		</div>

		<div class="flex items-center gap-2">
			<Select
				items={GROUPINGS.map((option) => ({ value: option, label: GROUPING_LABEL[option] }))}
				bind:value={grouping}
				searchable={false}
				mark={{ icon: LayoutGrid }}
				class="w-36"
			/>

			<DateRangePicker bind:value={filters.dateRange} />

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="icon" aria-label="Columns" {...props}>
							<Columns3 />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-44">
					<DropdownMenu.Label>Columns</DropdownMenu.Label>
					{#each hideableColumns as column (column.key)}
						<DropdownMenu.CheckboxItem
							checked={!hiddenColumns[column.key]}
							onCheckedChange={(on) =>
								(hiddenColumns = { ...hiddenColumns, [column.key]: !on })}
						>
							{column.label}
						</DropdownMenu.CheckboxItem>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			{#if canEdit}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								<FileUp />
								<span class="hidden sm:inline-block">Backup</span>
								<ChevronDown class="text-subtle" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<!-- Everything that moves data in or out, in one menu, as the
					     old header has it. Scanning a receipt is in here too: it
					     is another way of getting a transaction in, and the old
					     header has no button of its own for it. -->
					<DropdownMenu.Content align="end" class="w-64">
						<DropdownMenu.Item>
							<FileUp />
							Back up or restore on this device
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<ScanLine />
							Scan a receipt
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => (exportOpen = true)}>
							<FileDown />
							Export data to a spreadsheet
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Button onclick={openNew}>
					<Plus />
					Add
				</Button>
			{:else}
				<Button variant="outline" onclick={() => (exportOpen = true)}>
					<FileDown />
					Export data to a spreadsheet
				</Button>
			{/if}
		</div>
	</div>

	<TransactionsDataTable
		{rows}
		{categories}
		{wallets}
		bind:filters
		bind:grouping
		bind:hidden={hiddenColumns}
		toolbar={false}
		onAdd={openNew}
		onOpenRow={(row) => {
			detailRow = row;
			detailOpen = true;
		}}
		onSelectionChange={(ids) => (selectedIds = ids)}
	/>
</div>

<TransactionFormSheet
	bind:open={formOpen}
	bind:draft
	accounts={accountItems}
	categories={categoryItems}
	onCreateAccount={createAccount}
	onCreateCategory={createCategory}
/>

<TransactionDetailSheet
	bind:open={detailOpen}
	transaction={detail}
	onEdit={openEditFromDetail}
	onDelete={() => (detailOpen = false)}
/>

<TransactionExportModal bind:open={exportOpen} rowCount={rows.length} filtered={true} />

<TransactionBulkBar count={selectedIds.length} onClear={() => (selectedIds = [])} />
