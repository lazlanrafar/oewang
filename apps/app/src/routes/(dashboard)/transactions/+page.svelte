<script lang="ts">
	/**
	 * The transactions list (US-017).
	 *
	 * Nothing is filtered, sorted or paged in the browser: every one of those
	 * lives in the URL, goes to the server load, and comes back as the rows
	 * to render (TXN-9, UI-8, D55). That is what makes a shared link
	 * reproduce a view and a refresh keep it.
	 */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileDown from '@lucide/svelte/icons/file-down';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Plus from '@lucide/svelte/icons/plus';
	import ScanLine from '@lucide/svelte/icons/scan-line';

	import { toast } from 'svelte-sonner';

	import { applyAction, deserialize, enhance, type SubmitFunction } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';

	import { untrack } from 'svelte';

	import { parseDate } from '@internationalized/date';

	import { currentMonth } from '$lib/month-range';
	import { pagedRows } from '$lib/paged-rows.svelte';

	import { navigating, page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { Input } from '$lib/components/atoms/input';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { Label } from '$lib/components/atoms/label';
	import * as DropdownMenu from '$lib/components/atoms/dropdown-menu';
	import * as Select from '$lib/components/atoms/select';
	import { DateRangePicker, type DateRange } from '$lib/components/molecules/date-range-picker';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { SelectCategory } from '$lib/components/molecules/select-category';
	import type { DataTableFilterState } from '$lib/components/molecules/data-table-filter';
	import { TransactionsTable, TRANSACTION_COLUMNS } from '$lib/components/molecules/data-table';
	import type { ColumnKey, TableSort } from '$lib/components/molecules/data-table';
	import { GROUPINGS, type Grouping } from '$lib/components/molecules/data-table/grouping';
	import type { NamedOption, TransactionRow } from '$lib/components/molecules/data-table';
	import { FileDropzone, type UploadedFile } from '$lib/components/molecules/file-dropzone';
	import { ChatCanvas } from '$lib/components/organisms/chat';
	import {
		emptyDraft,
		ReceiptCanvas,
		TransactionBulkBar,
		TransactionDetailSheet,
		TransactionExportModal,
		TransactionFormFields,
		TransactionFormSheet,
		type TransactionDraft
	} from '$lib/components/organisms/transactions';
	import { FormError } from '$lib/components/molecules/form-error';
	import { canvasParams, readCanvas } from '$lib/canvas';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { absDecimal } from '$lib/money';
	import { toDetail } from '$lib/transaction-detail';
	import { isoDay, toRow } from '$lib/transactions';
	import { readParam, readText, readValues, writeParams } from '$lib/url-state';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	/**
	 * The rows fetched so far, not the rows of the current page.
	 *
	 * The list grows as it is scrolled, and the load answers one page at a
	 * time, so something has to hold what came before. It is keyed by the
	 * filters: a changed filter is a different list and resets it, while a
	 * changed page number is more of the same list and appends.
	 */
	const held = pagedRows<TransactionRow>();

	$effect(() => {
		// Only `data` is read inside the tracked part. `update` reads the
		// rows and the page it is holding, and those are state this effect
		// writes: tracked, the effect would depend on its own output and run
		// until the browser gave up, which is exactly what it did.
		const next = {
			rows: data.transactions.map((transaction) => toRow(transaction)),
			page: data.meta.page ?? 1,
			key: data.filterKey
		};
		untrack(() => held.update(next));
	});

	const rows = $derived(held.rows);

	const wallets = $derived<NamedOption[]>(
		data.wallets.map((wallet) => ({ id: wallet.id, name: wallet.name }))
	);
	const categories = $derived<NamedOption[]>(
		data.categories.map((category) => ({ id: category.id, name: category.name }))
	);

	/**
	 * How the list divides itself, in the URL like every other view choice.
	 *
	 * Four intervals, as the live app offers. `daily` is the default and so
	 * is the value the parameter is cleared to; an unknown value, including
	 * the `day` an older link may carry, falls back to it rather than to an
	 * error.
	 */
	const grouping = $derived(readParam(page.url, 'group', GROUPINGS, 'daily'));

	const GROUPING_LABEL: Record<Grouping, string> = $derived({
		none: t('txn.no_grouping'),
		daily: t('txn.group_by_day'),
		weekly: t('txn.group_by_week'),
		monthly: t('txn.group_by_month')
	});

	/**
	 * The date range, read back out of the URL.
	 *
	 * A day is a plain date, not an instant: `2026-11-03` means that day in
	 * the reader's own zone, which is why it travels as a `CalendarDate`
	 * rather than through `new Date()` (TXN-4).
	 */
	function readRange(url: {
		searchParams: { get(name: string): string | null };
	}): DateRange | undefined {
		const start = readText(url, 'start_date');
		const end = readText(url, 'end_date');

		// An empty range is not "no range": the load defaults it to this
		// month, so the picker has to show the same month or it reports a
		// view nobody is looking at.
		if (!start && !end) {
			const month = currentMonth();
			return { start: parseDate(month.start), end: parseDate(month.end) };
		}

		return {
			start: start ? parseDate(start) : undefined,
			end: end ? parseDate(end) : undefined
		};
	}

	const dateRange = $derived(readRange(page.url));

	/**
	 * The sort, read from the URL and written back to it.
	 *
	 * Server-side, because the list arrives a page at a time: sorting in the
	 * browser would order the rows fetched so far and call that the answer.
	 * The three clicks are ascending, descending, then back to the server's
	 * own order, which is why "no sort" is a cleared parameter rather than a
	 * third value.
	 */
	const SORT_KEYS = ['date', 'name', 'amount'] as const;

	const sort = $derived<TableSort>({
		key: readText(page.url, 'sort')
			? readParam(page.url, 'sort', SORT_KEYS, 'date')
			: null,
		descending: readText(page.url, 'order') !== 'asc'
	});

	/*
	 * `?type=` and `?is_ready=` are still read by the load function and still
	 * narrow the list; the old header has no control for either, so neither
	 * has one here. A link or a saved view can still carry them.
	 */

	/*
	 * The filter bar's own state, seeded from the URL and written back to it.
	 * The table is told not to filter: it already holds exactly the rows the
	 * server matched, and filtering twice would hide rows on page two.
	 */
	let filters = $state<DataTableFilterState>({ search: '', facets: {} });

	/**
	 * Which columns are off. Held here rather than in the table because the
	 * menu that changes it sits in this page's header, where the live app
	 * puts it.
	 */
	let hiddenColumns = $state<Partial<Record<ColumnKey, boolean>>>({});

	const hideableColumns = TRANSACTION_COLUMNS.filter((column) => !column.fixed);

	/** The column labels the rest of the page already names. */
	const COLUMN_LABEL: Record<string, string> = {
		date: 'style.col_date',
		name: 'style.col_name',
		amount: 'style.col_amount',
		account: 'style.col_wallet',
		category: 'style.col_category'
	};

	/**
	 * The URL is the filter bar's source of truth, not its destination only.
	 *
	 * Every field the bar can express is hydrated here, including the two
	 * that were silently dropped before: the amount bounds and the date
	 * range. Rebuilding the object without them wiped whatever the user had
	 * typed on the next navigation, which is why the amount control looked
	 * broken rather than merely unsaved (UI-8, D55).
	 */
	$effect(() => {
		const minAmount = readText(page.url, 'min_amount');
		const maxAmount = readText(page.url, 'max_amount');

		filters = {
			search: readText(page.url, 'search'),
			facets: {
				category: readValues(page.url, 'category_id'),
				wallet: readValues(page.url, 'wallet_id')
			},
			amount: minAmount || maxAmount ? { min: minAmount, max: maxAmount } : undefined,
			dateRange: readRange(page.url)
		};
	});

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * Push the filter bar's state into the URL.
	 *
	 * The search box waits for a pause in typing, because every change here
	 * is a round trip to the server; the facets go straight through.
	 */
	function applyFilters(next: DataTableFilterState) {
		// The range is the picker's, not the bar's: `showDate` is off here.
		// Writing it back would put the month the load defaults to into the
		// address bar on first paint, with nobody having chosen it.
		const wanted = {
			search: next.search,
			category_id: next.facets.category ?? [],
			wallet_id: next.facets.wallet ?? [],
			min_amount: next.amount?.min ?? '',
			max_amount: next.amount?.max ?? ''
		};

		// Nothing to do unless a filter actually moved.
		//
		// This runs on every navigation, because the bar is rebuilt from the
		// URL each time. Writing unconditionally also wrote `page: null`,
		// which silently undid every step the infinite scroll took: the list
		// asked for page two and was put back on page one before the rows
		// arrived.
		const unchanged = Object.entries(wanted).every(([key, value]) =>
			Array.isArray(value)
				? value.join('\u0000') === readValues(page.url, key).join('\u0000')
				: value === readText(page.url, key)
		);
		if (unchanged) return;

		clearTimeout(searchTimer);
		searchTimer = setTimeout(
			() => writeParams({ ...wanted, page: null }),
			wanted.search === readText(page.url, 'search') ? 0 : 300
		);
	}

	$effect(() => {
		applyFilters(filters);
	});

	/*
	 * The form sheet.
	 *
	 * Whether it is open and what it is editing live in `?sheet=`, so the
	 * back button closes it and a reload reopens it on the same row (UI-8).
	 */
	const sheetParam = $derived(readText(page.url, 'sheet'));
	const editing = $derived(
		data.transactions.find((transaction) => transaction.id === sheetParam) ?? null
	);
	/*
	 * The sheet's own open flag, kept in step with the URL in both
	 * directions. One way is not enough: the primitive closes itself on
	 * Escape and on the overlay, and the URL has to follow, or the back
	 * button would reopen a sheet the user just dismissed.
	 */
	let sheetOpen = $state(false);

	$effect(() => {
		sheetOpen = sheetParam !== '';
	});

	const walletCurrencies = $derived(
		Object.fromEntries(data.wallets.map((wallet) => [wallet.id, wallet.currency_code]))
	);
	const defaultWallet = $derived(
		data.wallets.find((wallet) => wallet.is_default) ?? data.wallets[0]
	);
	const baseCurrency = $derived(data.me.workspace.currency_code);

	let draft = $state<TransactionDraft>(emptyDraft());
	/** The files the sheet will submit with the transaction (TXN-13). */
	let attachments = $state<UploadedFile[]>([]);

	/** Rebuild the draft whenever the sheet points somewhere new. */
	$effect(() => {
		const fresh = emptyDraft(
			defaultWallet?.id ?? '',
			defaultWallet?.currency_code ?? baseCurrency,
			''
		);

		attachments = editing
			? (data.detail?.transaction.id === editing.id
					? data.detail.transaction.attachments.map((file) => ({
							id: file.file_id,
							name: file.name,
							type: file.type,
							size: file.size
						}))
					: [])
			: [];

		draft = editing
			? {
					...fresh,
					id: editing.id,
					type: editing.type,
					name: editing.name ?? '',
					// The amount field holds what the user typed, which is the
					// original figure when the entry currency differed. Reopening
					// it with the wallet-currency figure beside the entry currency
					// would convert an already converted number.
					amount: absDecimal(editing.original_amount ?? editing.amount),
					currency: editing.original_currency_code ?? editing.wallet_currency_code,
					exchangeRate: editing.exchange_rate ?? '',
					baseRate: editing.base_rate,
					accountId: editing.wallet_id,
					toAccountId: editing.to_wallet_id ?? '',
					toAmount: editing.to_amount ?? '',
					categoryId: editing.category_id ?? '',
					date: isoDay(editing.date),
					notes: editing.description ?? '',
					isReady: editing.is_ready
				}
			: fresh;
	});

	const draftWalletCurrency = $derived(walletCurrencies[draft.accountId] ?? baseCurrency);

	const accountItems = $derived(
		data.wallets.map((wallet) => ({ id: wallet.id, label: wallet.name }))
	);
	const categoryItems = $derived(
		data.categories.map((category) => ({ id: category.id, label: category.name }))
	);

	const openSheet = (id: string) => writeParams({ sheet: id }, { push: true });
	const closeSheet = () => writeParams({ sheet: null }, { push: true });

	function onSheetOpenChange(open: boolean) {
		if (!open && sheetParam !== '') closeSheet();
	}

	/** Close the sheet on a successful write; keep it open on a failure. */
	const saveAndClose: SubmitFunction = () => {
		const wasEditing = !!editing;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				await closeSheet();
				toast.success(wasEditing ? t('txn.updated') : t('txn.created'));
			}
			await update();
		};
	};

	/*
	 * The detail sheet, also addressed by the URL so a row can be linked to.
	 * Its contents are loaded on the server, because the browser never calls
	 * the API (D5).
	 */
	const detailParam = $derived(readText(page.url, 'detail'));
	let detailOpen = $state(false);

	$effect(() => {
		detailOpen = detailParam !== '' && data.detail !== null;
	});

	const detail = $derived(
		data.detail ? toDetail(data.detail.transaction, data.detail.history, baseCurrency) : undefined
	);

	const openDetail = (id: string) => writeParams({ detail: id }, { push: true });
	const closeDetail = () => writeParams({ detail: null }, { push: true });

	/**
	 * Two sheets cannot change places in the same tick: the overlay the first
	 * is still unmounting swallows the second. The detail closes itself
	 * through the primitive, and the form opens once the overlay has gone.
	 */
	async function editFromDetail() {
		const id = detailParam;
		await writeParams({ detail: null });
		setTimeout(() => openSheet(id), 260);
	}

	/**
	 * An in-cell category change.
	 *
	 * Posts to this page's own action the way a form would, because the cell
	 * is a picker rather than a form and there is nothing to submit. It is
	 * still the server that talks to the API (D5).
	 */
	function setCategory(id: string, categoryId: string) {
		return applyInCell('?/setCategory', { id, category_id: categoryId });
	}

	function setWallet(id: string, walletId: string) {
		return applyInCell('?/setWallet', { id, wallet_id: walletId });
	}

	/**
	 * One field, changed from a cell.
	 *
	 * The cell has already drawn the new value, so a failure has to put the
	 * row back: `invalidateAll` reloads what the server actually holds,
	 * which is also what makes a success stick.
	 */
	async function applyInCell(action: string, fields: Record<string, string>) {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.set(key, value);

		const response = await fetch(action, { method: 'POST', body });
		const result = deserialize(await response.text());

		if (result.type === 'success') {
			await invalidateAll();
			toast.success(t('txn.updated'));
		} else {
			await invalidateAll();
			await applyAction(result);
		}
	}

	// ------------------------------------------------------------- bulk

	let selection = $state<string[]>([]);
	let deleting = $state(false);
	let bulkCategoryOpen = $state(false);

	/** What the bulk dialog's picker is set to. Empty clears the category. */
	let bulkCategory = $state('');

	/**
	 * The picker's own list, with clearing offered as a row. A combobox has
	 * no empty option the way a native select does, and "no category" has to
	 * stay reachable: it is the only way to undo a wrong one in bulk.
	 */
	const bulkCategoryOptions = $derived([
		{ id: '', label: t('common.none') },
		...data.categories.map((category) => ({ id: category.id, label: category.name }))
	]);

	/** A bulk form posts the ids as one field, so it works without script too. */
	const selectedIds = $derived(selection.join(','));

	const afterBulk: SubmitFunction = () => {
		deleting = true;
		return async ({ result, update }) => {
			deleting = false;
			bulkCategoryOpen = false;
			if (result.type === 'success') {
				selection = [];
				toast.success(t('txn.bulk_applied'));
			}
			await update();
		};
	};

	const afterDelete: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				await closeDetail();
				toast.success(t('txn.deleted'));
			}
			await update();
		};
	};

	// ------------------------------------------------------- line items

	let itemDialog = $state<{
		open: boolean;
		item: { id: string; name: string; quantity: string | null; unit: string | null; amount: string } | null;
	}>({ open: false, item: null });
	let deletingItem = $state('');
	let deleteItemForm = $state<HTMLFormElement | null>(null);

	/**
	 * Keep the open sheet in the action's URL.
	 *
	 * A bare `?/addItem` replaces the whole query string, so the sheet the
	 * user is looking at closes the moment they save something in it.
	 */
	const keepDetail = (action: string) =>
		detailParam ? `${action}&detail=${encodeURIComponent(detailParam)}` : action;

	const afterItem: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				itemDialog = { open: false, item: null };
				toast.success(t('txn.item_saved'));
			}
			await update();
		};
	};

	// ----------------------------------------------------- the receipt canvas

	/**
	 * The receipt panel, driven by the URL like every other open thing on
	 * this page (D31, UI-8).
	 *
	 * The same panel the chat page mounts, over the same confirmation
	 * sheet: a receipt is confirmed the same way wherever it was dropped.
	 * `?canvas=transaction` is the manual form with the image attached,
	 * which is where an unreadable one lands (AI-3).
	 */
	const canvas = $derived(readCanvas(page.url));

	let scanOpen = $state(false);
	/** The dropzone's own list, cleared the moment the panel takes over. */
	let scanned = $state<UploadedFile[]>([]);
	let confirming = $state(false);
	let canvasError = $state<string | null>(null);

	const openCanvas = (kind: 'receipt' | 'transaction', id: string) =>
		writeParams(canvasParams({ kind, id }), { push: true });

	function closeCanvas() {
		canvasError = null;
		return writeParams(canvasParams(null), { push: true });
	}

	/* An upload finishing is what opens the panel (AI-1). */
	$effect(() => {
		const uploaded = scanned.at(-1);
		if (!uploaded) return;

		scanned = [];
		scanOpen = false;
		void openCanvas('receipt', uploaded.id);
	});

	/** The manual form behind `?canvas=transaction`, with the file on it. */
	let manualDraft = $state<TransactionDraft>(emptyDraft());
	let manualAttachments = $state<UploadedFile[]>([]);

	$effect(() => {
		if (canvas?.kind !== 'transaction') return;

		manualDraft = emptyDraft(
			defaultWallet?.id ?? '',
			defaultWallet?.currency_code ?? baseCurrency,
			''
		);

		const file = data.canvasFile;
		manualAttachments = file
			? [{ id: file.id, name: file.name, type: file.type, size: file.size }]
			: [];
	});

	const manualWalletCurrency = $derived(walletCurrencies[manualDraft.accountId] ?? baseCurrency);

	/** A confirmed receipt, or the manual form beside one. */
	const afterReceipt: SubmitFunction = () => {
		confirming = true;
		canvasError = null;

		return async ({ result, update }) => {
			confirming = false;

			if (result.type === 'failure') {
				canvasError = String(result.data?.code ?? 'STREAM_FAILED');
				return;
			}

			if (result.type === 'success') {
				await closeCanvas();
				toast.success(t('receipt.created'));
			}

			await update();
		};
	};

	// ----------------------------------------------------------- export

	let exportOpen = $state(false);

	/* Hidden forms the floating bars and the sheet submit. */
	let deleteForm = $state<HTMLFormElement | null>(null);

	/*
	 * Confirmations (UI-4). The design system's alert dialog rather than
	 * the browser's `confirm`, which blocks the renderer until it is
	 * dismissed and cannot be translated.
	 */
	let confirmDelete = $state(false);
	let confirmBulkDelete = $state(false);
	let confirmItemDelete = $state(false);
	let bulkDeleteForm = $state<HTMLFormElement | null>(null);
	let readyForm = $state<HTMLFormElement | null>(null);

	/**
	 * The export is a download, so it is a link to a server route rather than
	 * a fetch: the browser saves the file, and the route carries the same
	 * filters the page is showing.
	 */
	const exportHref = $derived(`/transactions/export?${page.url.searchParams.toString()}`);

	const meta = $derived(data.meta);
	const currentPage = $derived(meta.page ?? 1);
	const totalPages = $derived(meta.total_pages ?? 1);
	const total = $derived(meta.total ?? rows.length);
</script>

<svelte:head><title>{t('nav.transactions')} · {t('app.name')}</title></svelte:head>

<!-- The page reflows beside the receipt panel rather than being covered by
     it, the same way the conversation column does. -->
<!--
	A bounded column, not a growing one. `<main>` in the shell is already a
	flex column with a definite height, so `min-h-0 flex-1` here resolves to
	"whatever is left", and the table below can scroll inside it instead of
	taking the page with it. No `calc(100svh - …)`: the arithmetic would
	repeat the shell's header height and padding in a second place, and go
	stale the first time either moves.
-->
<div
	class="flex min-h-0 flex-1 flex-col gap-4 transition-[margin] duration-200 {canvas
		? 'md:me-[560px]'
		: ''}"
>
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
	<h1 class="sr-only">{t('nav.transactions')}</h1>

	<div class="flex shrink-0 items-center justify-between gap-4">
		<!-- The search takes the line; everything that acts on the table sits
		     at the far end. One row, as the old header is one row. -->
		<div class="flex flex-1 items-center">
			<DataTableFilter
				bind:filters
				facets={[
					{ id: 'category', label: t('style.col_category'), options: categories, multiple: false },
					{ id: 'wallet', label: t('style.col_wallet'), options: wallets, multiple: false }
				]}
				placeholder={t('txn.search_placeholder')}
				showDate={false}
				hideChips={['date']}
				class="w-full"
			/>
		</div>

		<div class="flex items-center gap-2">
			<Select.Root
				type="single"
				value={grouping}
				onValueChange={(value) => writeParams({ group: value === 'daily' ? null : value })}
			>
				<!-- A `role="combobox"` is not named by its contents the way a
				     button is, so it carries its own label (UI-6). -->
				<!-- The icon is the selector's own mark, as the live app draws
				     it: the trigger names the interval and nothing else, so
				     the label carries the accessible name instead. -->
				<Select.Trigger class="w-36" aria-label={t('txn.grouping_label')}>
					<LayoutGrid class="text-subtle size-4 shrink-0" />
					{GROUPING_LABEL[grouping]}
				</Select.Trigger>
				<Select.Content>
					{#each GROUPINGS as option (option)}
						<Select.Item value={option}>{GROUPING_LABEL[option]}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>

			<!-- Reads the URL as well as writing it. Write-only, the picker
			     showed "Pick a date range" on a link that carried one, and
			     the view a reader shared was not the view they saw. -->
			<DateRangePicker
				value={dateRange}
				onValueChange={(range) =>
					writeParams({
						start_date: range?.start?.toString() ?? null,
						end_date: range?.end?.toString() ?? null,
						page: null
					})}
			/>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="icon" aria-label={t('txn.columns')} {...props}>
							<Columns3 />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-44">
					<DropdownMenu.Label>{t('txn.columns')}</DropdownMenu.Label>
					{#each hideableColumns as column (column.key)}
						<DropdownMenu.CheckboxItem
							checked={!hiddenColumns[column.key]}
							onCheckedChange={(on) =>
								(hiddenColumns = { ...hiddenColumns, [column.key]: !on })}
						>
							{t(COLUMN_LABEL[column.key] as 'style.col_date')}
						</DropdownMenu.CheckboxItem>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			{#if canEdit}
				<!-- Everything that moves data in or out, in one menu, as the
				     old header has it. Scanning a receipt is in here too: it is
				     another way of getting a transaction in, and the old header
				     has no button of its own for it. -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>
								<FileUp />
								<span class="hidden sm:inline-block">{t('txn.backup')}</span>
								<ChevronDown class="text-subtle" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-64">
						<DropdownMenu.Item onclick={() => goto('/transactions/import')}>
							<FileUp />
							{t('txn.backup_device')}
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => (scanOpen = true)}>
							<ScanLine />
							{t('txn.receipt')}
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => (exportOpen = true)}>
							<FileDown />
							{t('txn.backup_export')}
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<Button onclick={() => openSheet('new')}>
					<Plus />
					{t('common.add')}
				</Button>
			{:else}
				<Button variant="outline" onclick={() => (exportOpen = true)}>
					<FileDown />
					{t('txn.backup_export')}
				</Button>
			{/if}
		</div>
	</div>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<TransactionsTable
		class="min-h-0 flex-1"
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		{sort}
		onSortChange={(next) =>
			writeParams({
				sort: next.key,
				order: next.key === null ? null : next.descending ? 'desc' : 'asc',
				page: null
			})}
		{rows}
		{categories}
		{wallets}
		{canEdit}
		{grouping}
		bind:hidden={hiddenColumns}
		toolbar={false}
		footer={false}
		emptyTitle={data.filtered ? t('txn.empty_filtered_title') : t('txn.empty_title')}
		emptyDescription={data.filtered
			? t('txn.empty_filtered_description')
			: t('txn.empty_description')}
		emptyActionLabel={t('txn.add_transaction')}
		bind:selection
		onAdd={() => openSheet('new')}
		onOpenRow={(row: TransactionRow) => openDetail(row.id)}
		onEditRow={(row: TransactionRow) => openSheet(row.id)}
		onDeleteRow={(row: TransactionRow) => openDetail(row.id)}
		onCategoryChange={(row: TransactionRow, categoryId: string) =>
			setCategory(row.id, categoryId)}
		onWalletChange={(row: TransactionRow, walletId: string) => setWallet(row.id, walletId)}
	/>

</div>

<TransactionFormSheet
	bind:open={sheetOpen}
	onOpenChange={onSheetOpenChange}
	bind:draft
	bind:attachments
	accounts={accountItems}
	categories={categoryItems}
	{baseCurrency}
	walletCurrency={draftWalletCurrency}
	suggestedRate={data.suggestedRate}
	fieldErrors={form?.fields}
	action={editing ? '?/update' : '?/create'}
	enhance={(node) => enhance(node, saveAndClose)}
/>

<!--
	The same field set without JavaScript. The sheet is a portal and a portal
	needs script to exist at all, so the no-script path is an ordinary form
	on the page rather than a second copy of the sheet's markup.
-->
<noscript>
	<section class="mt-8 border p-6">
		<h2 class="text-h2 mb-4">{t('txn.add_transaction')}</h2>
		<form method="POST" action="?/create" class="space-y-6">
			<TransactionFormFields
				bind:draft
				accounts={accountItems}
				categories={categoryItems}
				{baseCurrency}
				walletCurrency={draftWalletCurrency}
				suggestedRate={data.suggestedRate}
				fieldErrors={form?.fields}
				plain
			/>
			<Button type="submit">{t('common.save')}</Button>
		</form>
	</section>
</noscript>

<TransactionDetailSheet
	bind:open={detailOpen}
	onOpenChange={(open) => {
		if (!open && detailParam !== '') closeDetail();
	}}
	transaction={detail}
	{canEdit}
	onEdit={editFromDetail}
	onDelete={() => (confirmDelete = true)}
	onAddItem={() => (itemDialog = { open: true, item: null })}
	onEditItem={(itemId) =>
		(itemDialog = {
			open: true,
			item: data.detail?.transaction.items.find((item) => item.id === itemId) ?? null
		})}
	onDeleteItem={(itemId) => {
		deletingItem = itemId;
		deleteItemForm?.requestSubmit();
	}}
/>

<!-- Line items (TXN-12). They move no money, so they are their own forms
     rather than fields on the transaction. -->
<form
	bind:this={deleteItemForm}
	method="POST"
	action={keepDetail('?/deleteItem')}
	class="hidden"
	use:enhance={afterItem}
>
	<input type="hidden" name="transaction_id" value={detailParam} />
	<input type="hidden" name="item_id" value={deletingItem} />
</form>

<Dialog.Root bind:open={itemDialog.open}>
	<Dialog.Content class="sm:max-w-sm">
		<form
			method="POST"
			action={keepDetail(itemDialog.item ? '?/saveItem' : '?/addItem')}
			use:enhance={afterItem}
		>
			<Dialog.Header>
				<Dialog.Title>
					{itemDialog.item ? t('txn.edit_item') : t('txn.add_item')}
				</Dialog.Title>
			</Dialog.Header>

			<input type="hidden" name="transaction_id" value={detailParam} />
			{#if itemDialog.item}
				<input type="hidden" name="item_id" value={itemDialog.item.id} />
			{/if}

			<div class="space-y-4 py-4">
				<div class="grid gap-2">
					<Label for="item-name" class="text-subtle text-xs font-normal">
						{t('common.name')}
					</Label>
					<Input id="item-name" name="name" required value={itemDialog.item?.name ?? ''} />
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="item-quantity" class="text-subtle text-xs font-normal">
							{t('txn.quantity')}
						</Label>
						<Input
							id="item-quantity"
							name="quantity"
							inputmode="decimal"
							value={itemDialog.item?.quantity ?? ''}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="item-unit" class="text-subtle text-xs font-normal">
							{t('txn.unit')}
						</Label>
						<Input id="item-unit" name="unit" value={itemDialog.item?.unit ?? ''} />
					</div>
				</div>

				<div class="grid gap-2">
					<Label for="item-amount" class="text-subtle text-xs font-normal">
						{t('txn.item_amount')}
					</Label>
					<Input
						id="item-amount"
						name="amount"
						required
						inputmode="decimal"
						value={itemDialog.item?.amount ?? ''}
					/>
					<p class="text-subtle text-xs">{t('txn.item_amount_hint')}</p>
				</div>
			</div>

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit">{t('common.save')}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!--
	The delete lives in a form rather than in a fetch, so it is one action
	with one audit trail whichever way it is triggered. It confirms first
	(UI-4).
-->
<form
	bind:this={deleteForm}
	method="POST"
	action="?/delete"
	class="hidden"
	use:enhance={afterDelete}
>
	<input type="hidden" name="id" value={detailParam} />
</form>

<TransactionExportModal
	bind:open={exportOpen}
	rowCount={total}
	filtered={data.filtered}
	href={exportHref}
/>

<!--
	Scanning a receipt (AI-1). The same dropzone the form sheet and the
	composer use, so there is one upload path: split in the browser, chunk
	by chunk through this app's own server, never a signed storage URL (D23).
-->
<Dialog.Root bind:open={scanOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{t('txn.receipt')}</Dialog.Title>
			<Dialog.Description>{t('txn.receipt_hint')}</Dialog.Description>
		</Dialog.Header>

		<div class="py-2">
			<FileDropzone bind:files={scanned} />
		</div>
	</Dialog.Content>
</Dialog.Root>

<!--
	The canvas (D31, CHAT-13). The same panel and the same confirmation
	sheet the chat page mounts, because a receipt is confirmed the same way
	wherever it was dropped.
-->
<ChatCanvas
	open={canvas !== null}
	title={canvas?.kind === 'transaction' ? t('canvas.transaction_title') : t('canvas.receipt_title')}
	description={canvas?.kind === 'transaction'
		? t('canvas.transaction_description')
		: t('canvas.receipt_description')}
	onClose={closeCanvas}
>
	{#if canvas?.kind === 'transaction'}
		{#if canvasError}
			<p class="text-destructive text-small px-6 pt-4" role="alert">
				{messageForCode(canvasError)}
			</p>
		{/if}

		<TransactionFormSheet
			container="panel"
			bind:draft={manualDraft}
			bind:attachments={manualAttachments}
			accounts={accountItems}
			categories={categoryItems}
			{baseCurrency}
			walletCurrency={manualWalletCurrency}
			saving={confirming}
			fieldErrors={form?.fields}
			action="?/create"
			enhance={(node) => enhance(node, afterReceipt)}
		/>
	{:else}
		<ReceiptCanvas
			fileId={canvas?.kind === 'receipt' ? canvas.id : null}
			fileName={data.canvasFile?.name ?? ''}
			wallets={data.wallets}
			categories={data.categories}
			{baseCurrency}
			saving={confirming}
			errorCode={canvasError}
			fieldErrors={form?.fields}
			action="?/confirmReceipt"
			enhance={(node) => enhance(node, afterReceipt)}
			onCancel={closeCanvas}
			onManualEntry={() => openCanvas('transaction', canvas?.id ?? '')}
		/>
	{/if}
</ChatCanvas>

{#if canEdit}
	<TransactionBulkBar
		count={selection.length}
		{deleting}
		onClear={() => (selection = [])}
		onEditCategory={() => (bulkCategoryOpen = true)}
		onDelete={() => (confirmBulkDelete = true)}
		onReady={() => readyForm?.requestSubmit()}
	/>

	<form
		bind:this={bulkDeleteForm}
		method="POST"
		action="?/bulkDelete"
		class="hidden"
		use:enhance={afterBulk}
	>
		<input type="hidden" name="ids" value={selectedIds} />
	</form>

	<form
		bind:this={readyForm}
		method="POST"
		action="?/bulkUpdate"
		class="hidden"
		use:enhance={afterBulk}
	>
		<input type="hidden" name="ids" value={selectedIds} />
		<input type="hidden" name="is_ready" value="true" />
	</form>

	<Dialog.Root bind:open={bulkCategoryOpen}>
		<Dialog.Content class="sm:max-w-sm">
			<form method="POST" action="?/bulkUpdate" use:enhance={afterBulk}>
				<Dialog.Header>
					<Dialog.Title>{t('txn.bulk_category')}</Dialog.Title>
					<Dialog.Description>
						{t('txn.bulk_category_hint', { count: selection.length })}
					</Dialog.Description>
				</Dialog.Header>

				<input type="hidden" name="ids" value={selectedIds} />

				<!--
					The same picker the cells use, so choosing a category is one
					control across the page. It is script-driven, which costs
					nothing here: the dialog itself only exists with script.

					The wrapper is what spaces the body, as it does in every
					other dialog here: a `<form>` between the dialog and its
					parts swallows the dialog's own `gap-4`.
				-->
				<div class="py-4">
					<SelectCategory categories={bulkCategoryOptions} bind:value={bulkCategory} />
				</div>
				<input type="hidden" name="category_id" value={bulkCategory} />

				<Dialog.Footer>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button {...props} type="button" variant="outline">{t('common.cancel')}</Button>
						{/snippet}
					</Dialog.Close>
					<Button type="submit">{t('common.save')}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('txn.delete_title')}
	description={t('txn.delete_confirm')}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteForm?.requestSubmit()}
/>

<ConfirmDialog
	bind:open={confirmBulkDelete}
	title={t('txn.bulk_delete_title', { count: selection.length })}
	description={t('txn.bulk_delete_confirm', { count: selection.length })}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => bulkDeleteForm?.requestSubmit()}
/>

<ConfirmDialog
	bind:open={confirmItemDelete}
	title={t('txn.delete_item_title')}
	description={t('txn.delete_item_confirm')}
	confirmLabel={t('common.delete')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => deleteItemForm?.requestSubmit()}
/>
