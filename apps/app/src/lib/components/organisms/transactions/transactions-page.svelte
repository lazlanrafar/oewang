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
	import FileDown from '@lucide/svelte/icons/file-down';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Plus from '@lucide/svelte/icons/plus';

	import { Button } from '../../atoms/button/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import * as Select from '../../atoms/select/index.js';
	import { DateRangePicker } from '../../molecules/date-range-picker/index.js';
	import { DataTableFilter } from '../data-table-filter/index.js';
	import { emptyFilterState, type DataTableFilterState } from '../data-table-filter/index.js';
	import { TransactionsTable } from '../data-table/index.js';
	import type { NamedOption, TransactionRow } from '../data-table/index.js';
	import TransactionBulkBar from './transaction-bulk-bar.svelte';
	import TransactionDetailSheet from './transaction-detail-sheet.svelte';
	import TransactionExportModal from './transaction-export-modal.svelte';
	import TransactionFormSheet from './transaction-form-sheet.svelte';
	import { emptyDraft, type TransactionDraft } from './transaction-form-fields.svelte';

	let {
		rows,
		categories = $bindable(),
		wallets = $bindable(),
		title = 'Transactions',
		canEdit = true
	}: {
		rows: TransactionRow[];
		categories: NamedOption[];
		wallets: NamedOption[];
		title?: string;
		canEdit?: boolean;
	} = $props();

	let filters = $state<DataTableFilterState>(emptyFilterState());
	let grouping = $state<'day' | 'none'>('day');
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
					attachments: detailRow.note ? [{ id: 'f1', name: 'receipt-02-11-2026.jpg' }] : [],
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
	<!-- ------------------------------------------------------- header -->
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-4">
		<h1 class="text-h2">{title}</h1>

		<div class="flex flex-wrap items-center gap-2">
			<Select.Root type="single" bind:value={grouping}>
				<Select.Trigger class="w-36">
					{grouping === 'day' ? 'Group by day' : 'No grouping'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="day">Group by day</Select.Item>
					<Select.Item value="none">No grouping</Select.Item>
				</Select.Content>
			</Select.Root>

			<DateRangePicker bind:value={filters.dateRange} />

			{#if canEdit}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								<FileUp />
								<span class="hidden sm:inline-block">Import</span>
								<ChevronDown class="text-subtle" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						<DropdownMenu.Item>
							<FileUp />
							Import a CSV
						</DropdownMenu.Item>
						<DropdownMenu.Item>
							<FileUp />
							Import a statement with the assistant
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => (exportOpen = true)}>
							<FileDown />
							Export
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
					Export
				</Button>
			{/if}
		</div>
	</div>

	<!-- The filter sits on its own line, as the old header lays it out:
	     full width on the left, actions on the right above it. -->
	<DataTableFilter
		bind:filters
		facets={[
			{ id: 'category', label: 'Category', options: categories },
			{ id: 'wallet', label: 'Account', options: wallets }
		]}
		placeholder="Search transactions"
		showDate={false}
	/>

	<TransactionsTable
		{rows}
		{categories}
		{wallets}
		bind:filters
		bind:grouping
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
