<script lang="ts">
	/**
	 * The transactions list (US-017).
	 *
	 * Nothing is filtered, sorted or paged in the browser: every one of those
	 * lives in the URL, goes to the server load, and comes back as the rows
	 * to render (TXN-9, UI-8, D55). That is what makes a shared link
	 * reproduce a view and a refresh keep it.
	 */
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileDown from '@lucide/svelte/icons/file-down';
	import FileUp from '@lucide/svelte/icons/file-up';
	import Plus from '@lucide/svelte/icons/plus';
	import ScanLine from '@lucide/svelte/icons/scan-line';

	import { toast } from 'svelte-sonner';

	import { applyAction, deserialize, enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { Input } from '$lib/components/atoms/input';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { Label } from '$lib/components/atoms/label';
	import * as Select from '$lib/components/atoms/select';
	import { DateRangePicker } from '$lib/components/molecules/date-range-picker';
	import { DataTableFilter } from '$lib/components/organisms/data-table-filter';
	import type { DataTableFilterState } from '$lib/components/organisms/data-table-filter';
	import { TransactionsTable } from '$lib/components/organisms/data-table';
	import type { NamedOption, TransactionRow } from '$lib/components/organisms/data-table';
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
	import FormError from '$lib/components/shell/form-error.svelte';
	import { canvasParams, readCanvas } from '$lib/canvas';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { absDecimal } from '$lib/money';
	import { toDetail } from '$lib/transaction-detail';
	import { isoDay, toRow } from '$lib/transactions';
	import { readParam, readText, writeParams } from '$lib/url-state';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	const rows = $derived(data.transactions.map((transaction) => toRow(transaction)));

	const wallets = $derived<NamedOption[]>(
		data.wallets.map((wallet) => ({ id: wallet.id, name: wallet.name }))
	);
	const categories = $derived<NamedOption[]>(
		data.categories.map((category) => ({ id: category.id, name: category.name }))
	);

	const TYPES = ['', 'income', 'expense', 'transfer'] as const;
	const READY = ['', 'true', 'false'] as const;
	const GROUPING = ['day', 'none'] as const;

	const typeFilter = $derived(readParam(page.url, 'type', TYPES, ''));
	const readyFilter = $derived(readParam(page.url, 'is_ready', READY, ''));
	const grouping = $derived(readParam(page.url, 'group', GROUPING, 'day'));

	/*
	 * The filter bar's own state, seeded from the URL and written back to it.
	 * The table is told not to filter: it already holds exactly the rows the
	 * server matched, and filtering twice would hide rows on page two.
	 */
	let filters = $state<DataTableFilterState>({ search: '', facets: {} });

	$effect(() => {
		filters = {
			search: readText(page.url, 'search'),
			facets: {
				category: readText(page.url, 'category_id') ? [readText(page.url, 'category_id')] : [],
				wallet: readText(page.url, 'wallet_id') ? [readText(page.url, 'wallet_id')] : []
			}
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
		const category = next.facets.category?.[0] ?? '';
		const wallet = next.facets.wallet?.[0] ?? '';
		const search = next.search;

		clearTimeout(searchTimer);
		searchTimer = setTimeout(
			() => writeParams({ search, category_id: category, wallet_id: wallet, page: null }),
			search === readText(page.url, 'search') ? 0 : 300
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
	async function setCategory(id: string, categoryId: string) {
		const body = new FormData();
		body.set('id', id);
		body.set('category_id', categoryId);

		const response = await fetch('?/setCategory', { method: 'POST', body });
		const result = deserialize(await response.text());

		if (result.type === 'success') {
			await invalidateAll();
			toast.success(t('txn.updated'));
		} else {
			await applyAction(result);
		}
	}

	// ------------------------------------------------------------- bulk

	let selection = $state<string[]>([]);
	let deleting = $state(false);
	let bulkCategoryOpen = $state(false);

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
<div
	class="flex flex-col gap-4 transition-[margin] duration-200 {canvas ? 'md:me-[560px]' : ''}"
>
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-4">
		<h1 class="text-h2">{t('nav.transactions')}</h1>

		<div class="flex flex-wrap items-center gap-2">
			<Select.Root
				type="single"
				value={grouping}
				onValueChange={(value) => writeParams({ group: value === 'day' ? null : value })}
			>
				<!-- A `role="combobox"` is not named by its contents the way a
				     button is, so each of these three carries its own label
				     (UI-6). Without one a screen reader announces three
				     unnamed controls in a row. -->
				<Select.Trigger class="w-36" aria-label={t('txn.grouping_label')}>
					{grouping === 'day' ? t('txn.group_by_day') : t('txn.no_grouping')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="day">{t('txn.group_by_day')}</Select.Item>
					<Select.Item value="none">{t('txn.no_grouping')}</Select.Item>
				</Select.Content>
			</Select.Root>

			<Select.Root
				type="single"
				value={typeFilter}
				onValueChange={(value) => writeParams({ type: value || null, page: null })}
			>
				<Select.Trigger class="w-32" aria-label={t('txn.type_label')}>
					{typeFilter === '' ? t('txn.all_types') : t(`txn.type_${typeFilter}` as 'txn.type_income')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">{t('txn.all_types')}</Select.Item>
					<Select.Item value="income">{t('txn.type_income')}</Select.Item>
					<Select.Item value="expense">{t('txn.type_expense')}</Select.Item>
					<Select.Item value="transfer">{t('txn.type_transfer')}</Select.Item>
				</Select.Content>
			</Select.Root>

			<Select.Root
				type="single"
				value={readyFilter}
				onValueChange={(value) => writeParams({ is_ready: value || null, page: null })}
			>
				<Select.Trigger class="w-32" aria-label={t('txn.ready_label')}>
					{readyFilter === '' ? t('txn.any_ready') : readyFilter === 'true' ? t('txn.ready') : t('txn.not_ready')}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">{t('txn.any_ready')}</Select.Item>
					<Select.Item value="true">{t('txn.ready')}</Select.Item>
					<Select.Item value="false">{t('txn.not_ready')}</Select.Item>
				</Select.Content>
			</Select.Root>

			<DateRangePicker
				onValueChange={(range) =>
					writeParams({
						start_date: range?.start?.toString() ?? null,
						end_date: range?.end?.toString() ?? null,
						page: null
					})}
			/>

			<Button variant="outline" onclick={() => (exportOpen = true)}>
				<FileDown />
				{t('txn.export')}
			</Button>

			{#if canEdit}
				<Button variant="outline" onclick={() => (scanOpen = true)}>
					<ScanLine />
					{t('txn.receipt')}
				</Button>
				<Button href="/transactions/import" variant="outline">
					<FileUp />
					{t('txn.import')}
				</Button>
				<Button onclick={() => openSheet('new')}>
					<Plus />
					{t('common.add')}
				</Button>
			{/if}
		</div>
	</div>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	<DataTableFilter
		bind:filters
		facets={[
			{ id: 'category', label: t('style.col_category'), options: categories, multiple: false },
			{ id: 'wallet', label: t('style.col_wallet'), options: wallets, multiple: false }
		]}
		placeholder={t('txn.search_placeholder')}
		showDate={false}
	/>

	<TransactionsTable
		{rows}
		{categories}
		{wallets}
		{canEdit}
		grouping={grouping as 'day' | 'none'}
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
	/>

	<!-- Server pagination: the footer moves `?page=`, and the load does the
	     rest. A page step is a history entry, unlike a filter change. -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<p class="text-subtle text-small">{t('txn.row_count', { count: total })}</p>

		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				class="size-8"
				disabled={currentPage <= 1}
				aria-label={t('txn.previous_page')}
				onclick={() => writeParams({ page: currentPage - 1 }, { push: true })}
			>
				<ChevronLeft class="size-4" />
			</Button>
			<span class="text-subtle text-small tabular-nums">
				{t('txn.page_of', { page: currentPage, total: totalPages })}
			</span>
			<Button
				variant="outline"
				size="icon"
				class="size-8"
				disabled={currentPage >= totalPages}
				aria-label={t('txn.next_page')}
				onclick={() => writeParams({ page: currentPage + 1 }, { push: true })}
			>
				<ChevronRight class="size-4" />
			</Button>
		</div>
	</div>
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

				<div class="py-4">
					<select
						name="category_id"
						class="border-input bg-background h-9 w-full border px-3 text-sm"
					>
						<option value="">{t('common.none')}</option>
						{#each data.categories as category (category.id)}
							<option value={category.id}>{category.name}</option>
						{/each}
					</select>
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
