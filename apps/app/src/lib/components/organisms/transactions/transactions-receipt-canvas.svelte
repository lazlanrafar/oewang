<script lang="ts">
	/**
	 * The receipt panel's contents, for whichever page mounts the canvas
	 * (AI-1 to AI-3, CHAT-13).
	 *
	 * The chat page and the transactions page both open the same panel over
	 * the same confirmation sheet, so the reading, the four states it can be
	 * in and the retry live here once rather than on each page.
	 *
	 * It does ask for the receipt, which a component normally should not do
	 * (docs/best-practices/svelte-app.md#component-organization). The
	 * exception is deliberate and narrow: the request is `requestReceipt`,
	 * which is tested on its own with a stubbed `fetch`, and it goes to this
	 * app's own server route, never to the API (D5). The alternative was
	 * the same ten lines of state machine on two pages.
	 *
	 * Nothing is persisted by any of this. A transaction exists only once
	 * the user presses the button, and cancelling leaves the uploaded file
	 * exactly where it is (AI-2).
	 */
	import {
		requestReceipt,
		toReceiptForm,
		type ReceiptForm,
		type ReceiptRequest
	} from '$lib/receipt.js';
	import { messageForCode } from '$lib/errors.js';
	import { t } from '$lib/i18n';

	import { Button } from '../../atoms/button/index.js';
	import type { CategoryItem } from '../../molecules/select-category/index.js';
	import type { ComboboxItem } from '../../molecules/combobox/index.js';
	import ReceiptConfirmationSheet from './transactions-receipt-confirmation-sheet.svelte';

	let {
		fileId,
		fileName = '',
		wallets,
		categories,
		baseCurrency,
		saving = false,
		errorCode = null,
		fieldErrors,
		action = '/transactions?/confirmReceipt',
		enhance,
		onCancel,
		onManualEntry,
		onParsed
	}: {
		/** The vault file the panel is open on, or null while it is closed. */
		fileId: string | null;
		fileName?: string;
		wallets: Array<{ id: string; name: string; currency_code: string; is_default: boolean }>;
		categories: Array<{ id: string; name: string; type: string }>;
		baseCurrency: string;
		saving?: boolean;
		/** A refused write, by code. The read's own failures are held here. */
		errorCode?: string | null;
		fieldErrors?: Record<string, string>;
		action?: string;
		enhance?: (node: HTMLFormElement) => void;
		onCancel: () => void;
		/** Give up on the draft and type it by hand, image still attached. */
		onManualEntry: () => void;
		/** What was read, so the page can carry it into the manual form. */
		onParsed?: (form: ReceiptForm | null) => void;
	} = $props();

	let request = $state<ReceiptRequest | null>(null);
	let form = $state<ReceiptForm | null>(null);

	/**
	 * The file the read has been asked for.
	 *
	 * A plain variable rather than `$state`, so the effect below does not
	 * depend on what it writes. Nothing renders from it.
	 */
	let requestedFor = '';

	const accountItems = $derived<ComboboxItem[]>(
		wallets.map((wallet) => ({ id: wallet.id, label: wallet.name }))
	);
	const categoryItems = $derived<CategoryItem[]>(
		categories.map((category) => ({ id: category.id, label: category.name }))
	);
	const walletCurrency = $derived(
		wallets.find((wallet) => wallet.id === form?.walletId)?.currency_code ?? baseCurrency
	);

	/*
	 * Read the receipt the panel opened on.
	 *
	 * Asked once per file rather than once per render, and asked again
	 * after a reload, because the API persists no draft: that is the price
	 * of nothing being written until the user agrees (AI-2).
	 */
	$effect(() => {
		const id = fileId;

		if (id === null) {
			requestedFor = '';
			request = null;
			form = null;
			return;
		}

		if (requestedFor === id) return;
		requestedFor = id;
		void read(id);
	});

	async function read(id: string) {
		request = null;
		form = null;
		onParsed?.(null);

		const result = await requestReceipt(id, fetch);
		// The panel may have moved on while the model was reading.
		if (requestedFor !== id) return;

		request = result;

		if (result.status !== 'ready') return;

		form = toReceiptForm(result.parsed, {
			wallets,
			categories,
			baseCurrency,
			today: new Date().toISOString().slice(0, 10)
		});
		onParsed?.(form);
	}
</script>

{#if errorCode}
	<p class="text-destructive text-small px-6 pt-4" role="alert">{messageForCode(errorCode)}</p>
{/if}

{#if request?.status === 'ready' && form}
	<ReceiptConfirmationSheet
		container="panel"
		bind:form
		quality={request.parsed.quality}
		fileId={fileId ?? ''}
		{fileName}
		accounts={accountItems}
		categories={categoryItems}
		{walletCurrency}
		{saving}
		{fieldErrors}
		{action}
		{enhance}
		{onCancel}
		{onManualEntry}
	/>
{:else if request?.status === 'unreadable'}
	<div class="space-y-4 px-6 py-6">
		<p class="text-small">{t('canvas.unreadable')}</p>
		<Button type="button" variant="outline" onclick={onManualEntry}>
			{t('receipt.manual_entry')}
		</Button>
	</div>
{:else if request?.status === 'queued'}
	<!-- The reader did not answer. The receipt is already in the vault and
	     is saved by itself when the reader is back (D95). -->
	<div class="space-y-4 px-6 py-6" role="status">
		<p class="text-small font-medium">{t('receipt.queued_title')}</p>
		<p class="text-subtle text-small">{t('receipt.queued_body')}</p>
		<Button type="button" variant="outline" onclick={onCancel}>{t('receipt.queued_close')}</Button>
	</div>
{:else if request?.status === 'failed'}
	<div class="space-y-4 px-6 py-6">
		<p class="text-destructive text-small" role="alert">{messageForCode(request.code)}</p>
		<Button type="button" variant="outline" onclick={() => fileId && read(fileId)}>
			{t('common.retry')}
		</Button>
	</div>
{:else}
	<div class="px-6 py-6">
		<p class="text-subtle text-small" aria-live="polite">{t('canvas.reading')}</p>
	</div>
{/if}
