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
	import Plus from '@lucide/svelte/icons/plus';

	import { toast } from 'svelte-sonner';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import * as Select from '$lib/components/atoms/select';
	import { DateRangePicker } from '$lib/components/molecules/date-range-picker';
	import { DataTableFilter } from '$lib/components/organisms/data-table-filter';
	import type { DataTableFilterState } from '$lib/components/organisms/data-table-filter';
	import { TransactionsTable } from '$lib/components/organisms/data-table';
	import type { NamedOption, TransactionRow } from '$lib/components/organisms/data-table';
	import {
		emptyDraft,
		TransactionFormFields,
		TransactionFormSheet,
		type TransactionDraft
	} from '$lib/components/organisms/transactions';
	import FormError from '$lib/components/shell/form-error.svelte';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { absDecimal } from '$lib/money';
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

	/** Rebuild the draft whenever the sheet points somewhere new. */
	$effect(() => {
		const fresh = emptyDraft(
			defaultWallet?.id ?? '',
			defaultWallet?.currency_code ?? baseCurrency,
			''
		);

		draft = editing
			? {
					...fresh,
					id: editing.id,
					type: editing.type,
					name: editing.name ?? '',
					amount: absDecimal(editing.amount),
					// A row entered in another currency reopens in that currency,
					// with the rate it was written at.
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

	const meta = $derived(data.meta);
	const currentPage = $derived(meta.page ?? 1);
	const totalPages = $derived(meta.total_pages ?? 1);
	const total = $derived(meta.total ?? rows.length);
</script>

<svelte:head><title>{t('nav.transactions')} · {t('app.name')}</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-4">
		<h1 class="text-h2">{t('nav.transactions')}</h1>

		<div class="flex flex-wrap items-center gap-2">
			<Select.Root
				type="single"
				value={grouping}
				onValueChange={(value) => writeParams({ group: value === 'day' ? null : value })}
			>
				<Select.Trigger class="w-36">
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
				<Select.Trigger class="w-32">
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
				<Select.Trigger class="w-32">
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

			{#if canEdit}
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
		onAdd={() => openSheet('new')}
		onEditRow={(row: TransactionRow) => openSheet(row.id)}
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
