<script lang="ts">
	/**
	 * One conversation, with the live turn (US-028, US-031, US-031b).
	 *
	 * The stored messages arrive from the server load, so a reload shows the
	 * conversation without this code running at all. What is added here is
	 * the turn in flight: the question appears at once, the tools the model
	 * reaches for appear as progress, the answer grows as tokens arrive, and
	 * the stop button ends it.
	 *
	 * The browser never talks to the API (D5). `/chat/stream` beside this
	 * route is the only hop it knows about.
	 *
	 * The answer renders as plain text while it arrives and as Markdown once
	 * the turn ends: half a table is not a table. The rendering itself is
	 * `$lib/markdown`, which never parses raw HTML (SEC-11), and what it
	 * renders as an entity link is dispatched by `openEntity` below.
	 *
	 * The canvas is the other half of this page (D31, CHAT-13). A receipt
	 * dropped into the composer opens a side panel holding the real
	 * confirmation sheet, and this column animates its own margin so it
	 * reflows beside it instead of being covered. What is open lives in
	 * `?canvas=` and `?id=`, so a reload reopens it (UI-8).
	 */
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { canvasParams, readCanvas } from '$lib/canvas';
	import {
		advance,
		IDLE_TURN,
		isActive,
		readFrames,
		toolsRunning,
		visibleText,
		type Turn
	} from '$lib/chat-stream';
	import { toMessageItem, type MessageItem } from '$lib/chat';
	import type { EntityTarget } from '$lib/chat-entities';
	import { invalidateForToolCalls, invalidationsForTool } from '$lib/chat-invalidation';
	import { toolLabel } from '$lib/chat-tools';
	import {
		ChatCanvas,
		ChatInput,
		ChatMessages,
		ChatSuggestions
	} from '$lib/components/organisms/chat';
	import {
		emptyDraft,
		ReceiptCanvas,
		TransactionFormSheet,
		type TransactionDraft
	} from '$lib/components/organisms/transactions';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { ScrollArea } from '$lib/components/atoms/scroll-area';
	import { AttachmentView } from '$lib/components/molecules/attachment-view';
	import type { UploadedFile } from '$lib/components/molecules/file-dropzone';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import type { ReceiptForm } from '$lib/receipt';
	import type { ChatRole } from '$lib/server/chat';
	import { writeParams } from '$lib/url-state';

	let { data } = $props();

	let draft = $state('');
	/** The files the next turn carries, already in the vault (VLT-1). */
	let attached = $state<UploadedFile[]>([]);
	let turn = $state<Turn>(IDLE_TURN);
	/** The question, shown before the server has a row for it. */
	let asked = $state<MessageItem | null>(null);
	/** One clock reading per turn, so the timestamps do not tick per token. */
	let startedAt = $state('');
	let foot = $state<HTMLDivElement | null>(null);
	/** The attachment the reader asked to see, from a chip or a `#file:` link. */
	let openFileId = $state<string | null>(null);

	let abort: AbortController | null = null;
	let storedBefore = 0;

	/**
	 * The tool calls already acted on, by id (D32, CHAT-12).
	 *
	 * It survives the whole conversation rather than the turn: the stream
	 * hands the same call back on every event that follows it, and a second
	 * invalidation buys nothing.
	 */
	const invalidated = new Set<string>();

	const stored = $derived(data.conversation.messages.map((message) => toMessageItem(message)));

	/*
	 * The answer so far: what the model has said, minus the narration the
	 * suppression rule holds back while tools run (CHAT-14), plus the tools
	 * themselves. It appears with the first of either rather than as an
	 * empty bubble; until then the status line says what is happening.
	 */
	const answering = $derived.by(() => {
		const text = visibleText(turn);
		if (text === '' && turn.toolCalls.length === 0) return null;

		return { ...local('assistant', text, 'turn-assistant'), toolCalls: turn.toolCalls };
	});

	const messages = $derived([
		...stored,
		...(asked ? [asked] : []),
		...(answering ? [answering] : [])
	]);

	const status = $derived(statusLabel(turn));

	/** The file the dialog is showing, if this conversation still has it. */
	const openFile = $derived(openFileId ? (data.files[openFileId] ?? null) : null);

	function local(role: ChatRole, content: string, id: string): MessageItem {
		return toMessageItem({ id, role, content, created_at: startedAt });
	}

	function statusLabel(current: Turn): string {
		// A running tool is more informative than "Answering", and this line
		// is the conversation's live region, so it is what gets announced.
		if (isActive(current) && toolsRunning(current)) {
			const running = current.toolCalls.find((call) => call.status === 'running');
			if (running) return toolLabel(running.name);
		}

		if (current.status === 'sending') return t('chat.status_sending');
		if (current.status === 'streaming') return t('chat.status_streaming');
		if (current.status === 'stopped') return t('chat.status_stopped');
		return '';
	}

	/* Follow the answer down as it grows. */
	$effect(() => {
		// Read what changes, so the effect runs per token.
		void turn.text;
		void turn.toolCalls.length;
		void messages.length;
		foot?.scrollIntoView({ block: 'end', behavior: 'auto' });
	});

	/*
	 * A tool write leaves the rest of the app stale, and there is no
	 * realtime channel to fix it with (D32). Each successful call drops its
	 * keys here once, and SvelteKit reruns whatever load declared them.
	 */
	$effect(() => {
		const calls = turn.toolCalls;
		void invalidateForToolCalls(calls, invalidated, invalidate);
	});

	async function send(message: string) {
		if (isActive(turn)) return;

		const carrying = attached;

		startedAt = new Date().toISOString();
		asked = {
			...local('user', message, 'turn-user'),
			files: carrying.map((file) => ({ id: file.id, name: file.name, type: file.type }))
		};
		turn = advance(turn, { kind: 'send' });
		draft = '';
		attached = [];
		storedBefore = data.conversation.messages.length;

		abort = new AbortController();

		try {
			const response = await fetch('/chat/stream', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					session_id: data.conversation.id,
					message,
					attachment_ids: carrying.map((file) => file.id)
				}),
				signal: abort.signal
			});

			if (!response.ok || !response.body) {
				turn = advance(turn, { kind: 'failed', code: 'STREAM_FAILED' });
				return;
			}

			await read(response.body);
		} catch {
			// An abort lands here too, and is not a failure: the stop button
			// has already moved the turn, and `advance` ignores what follows.
			turn = advance(turn, { kind: 'failed', code: 'STREAM_FAILED' });
		} finally {
			abort = null;
			await settle();
		}
	}

	/** Frames in, turn out. Nothing waits for the stream to finish. */
	async function read(body: ReadableStream<Uint8Array>) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const chunk = readFrames(buffer);
			buffer = chunk.rest;

			for (const frame of chunk.frames) turn = advance(turn, { kind: 'frame', frame });
		}
	}

	function stop() {
		turn = advance(turn, { kind: 'stop' });
		// Dropping the connection is what reaches the API: it stops
		// generating and keeps the partial reply (CHAT-9).
		abort?.abort();
	}

	/**
	 * Hand the turn back to the server.
	 *
	 * The API persists both messages, including a reply that was stopped
	 * part way, so the stored conversation is the truth and the local copies
	 * go. They stay if the refresh brought nothing new, which is what a
	 * failed turn looks like, and the question remains on screen beside the
	 * error rather than vanishing with it.
	 */
	async function settle() {
		const before = storedBefore;
		await invalidateAll();

		if (data.conversation.messages.length > before) {
			asked = null;
			turn = IDLE_TURN;
		}
	}

	/**
	 * Open what an entity link points at (D33, CHAT-11).
	 *
	 * The target is decided by `$lib/chat-entities`, which refuses anything
	 * that would leave this app. Everything here is an ordinary client-side
	 * navigation to a page of ours, except a file, which the dialog below
	 * shows without leaving the conversation.
	 */
	function openEntity(target: EntityTarget) {
		if (target.kind === 'file') {
			openFileId = target.id;
			return;
		}

		void goto(target.href);
	}

	async function copy(message: MessageItem) {
		try {
			await navigator.clipboard.writeText(message.content);
			toast.success(t('chat.copied'));
		} catch {
			// Clipboard access is refused outside a secure context and in
			// some privacy modes. Saying so beats a button that does nothing.
			toast.error(t('chat.copy_failed'));
		}
	}

	/**
	 * Ask the last question again.
	 *
	 * A new turn rather than a rewrite: nothing in the API replaces an
	 * assistant message, and quietly dropping the previous answer would
	 * lose a reply the user may still want to compare against.
	 */
	function regenerate() {
		const previous = [...messages].reverse().find((message) => message.role === 'user');
		if (previous) void send(previous.content);
	}

	// --------------------------------------------------------- the canvas

	/**
	 * What the panel is showing, read from the URL (D31, CHAT-13).
	 *
	 * `?canvas=receipt&id=…` is the confirmation sheet over a parsed
	 * receipt; `?canvas=transaction&id=…` is the real transaction form with
	 * that file attached, which is where an unreadable image lands (AI-3).
	 * Both survive a reload, which is the point of putting them here.
	 */
	const canvas = $derived(readCanvas(page.url));

	let confirming = $state(false);
	/** What the panel read, kept so the manual form can start from it. */
	let receiptForm = $state<ReceiptForm | null>(null);

	const baseCurrency = $derived(data.me.workspace.currency_code);
	const accountItems = $derived(
		data.wallets.map((wallet) => ({ id: wallet.id, label: wallet.name }))
	);
	const categoryItems = $derived(
		data.categories.map((category) => ({ id: category.id, label: category.name }))
	);
	const walletCurrencies = $derived(
		Object.fromEntries(data.wallets.map((wallet) => [wallet.id, wallet.currency_code]))
	);

	const openCanvas = (kind: 'receipt' | 'transaction', id: string) =>
		writeParams(canvasParams({ kind, id }), { push: true });

	function closeCanvas() {
		receiptForm = null;
		canvasError = null;
		return writeParams(canvasParams(null), { push: true });
	}

	/*
	 * A file dropped into the composer opens the panel (AI-1).
	 *
	 * The upload finishes in the dropzone, so the newest entry in
	 * `attached` is the thing to read. The message it was attached to can
	 * still be sent: the panel sits beside the conversation rather than
	 * over it, which is the whole reason it is a canvas.
	 */
	let openedFor = '';

	$effect(() => {
		const newest = attached.at(-1);
		if (!newest || openedFor === newest.id) return;

		openedFor = newest.id;
		void openCanvas('receipt', newest.id);
	});

	/** The manual form behind `?canvas=transaction`, with the file on it. */
	let manualDraft = $state<TransactionDraft>(emptyDraft());
	let manualAttachments = $state<UploadedFile[]>([]);

	$effect(() => {
		if (canvas?.kind !== 'transaction') return;

		const wallet = data.wallets.find((candidate) => candidate.is_default) ?? data.wallets[0];
		const fresh = emptyDraft(wallet?.id ?? '', wallet?.currency_code ?? baseCurrency, '');

		// Whatever the parse did manage to read is better than an empty
		// form, so the merchant and the total come along when they exist.
		manualDraft = receiptForm
			? { ...fresh, name: receiptForm.merchant, amount: receiptForm.total, date: receiptForm.date }
			: fresh;

		const file = data.canvasFile;
		manualAttachments = file
			? [{ id: file.id, name: file.name, type: file.type, size: file.size }]
			: [];
	});

	const manualWalletCurrency = $derived(walletCurrencies[manualDraft.accountId] ?? baseCurrency);

	/** A refused write, by code, shown in the panel rather than as a toast. */
	let canvasError = $state<string | null>(null);

	/**
	 * A confirmed receipt, or a transaction typed by hand beside one.
	 *
	 * Both post to `/transactions`, which is where every transaction write
	 * in this app happens; confirming a receipt in two places would be two
	 * places for the rules to drift. The default `update()` is not called,
	 * because applying another route's action result to this page would
	 * replace the conversation's own `form` data with a transaction's.
	 *
	 * The write leaves the rest of the app stale in exactly the way a chat
	 * write does, so the same map answers for it (D32): a transaction moves
	 * a wallet balance and every total computed from it, whoever made it.
	 */
	const afterCreate: SubmitFunction = () => {
		confirming = true;
		canvasError = null;

		return async ({ result }) => {
			confirming = false;

			if (result.type === 'failure') {
				canvasError = String(result.data?.code ?? 'STREAM_FAILED');
				return;
			}

			if (result.type !== 'success') return;

			await closeCanvas();
			for (const key of invalidationsForTool('create_transaction')) await invalidate(key);
			toast.success(t('receipt.created'));
		};
	};
</script>

<svelte:head><title>{data.conversation.title} · {t('app.name')}</title></svelte:head>

<!--
	The conversation column reflows beside the panel rather than being
	covered by it: its own margin animates to the panel's width above the
	medium breakpoint, and below it the panel takes the screen.
-->
<div
	class="flex h-full min-h-0 flex-col gap-4 transition-[margin] duration-200 {canvas
		? 'md:me-[560px]'
		: ''}"
>
	<header class="flex shrink-0 items-baseline justify-between gap-4">
		<h1 class="text-h2 truncate">{data.conversation.title}</h1>
	</header>

	<ScrollArea class="min-h-0 flex-1">
		<div class="pr-4 pb-4">
			<ChatMessages
				{messages}
				emptyBody={t('chat.empty_conversation')}
				streamingId={answering?.id ?? null}
				busy={isActive(turn)}
				onEntity={openEntity}
				onCopy={copy}
				onRegenerate={regenerate}
			>
				{#snippet emptyActions()}
					<ChatSuggestions disabled={isActive(turn)} onSelect={send} />
				{/snippet}
			</ChatMessages>
			<div bind:this={foot}></div>
		</div>
	</ScrollArea>

	<div class="flex shrink-0 flex-col gap-2 border-t pt-4">
		<p class="text-subtle text-caption" aria-live="polite">{status}</p>

		{#if turn.status === 'failed'}
			<p class="text-destructive text-caption" role="alert">
				{messageForCode(turn.errorCode ?? 'STREAM_FAILED')}
			</p>
		{/if}

		<ChatInput
			bind:value={draft}
			bind:files={attached}
			streaming={isActive(turn)}
			onSend={send}
			onStop={stop}
		/>
	</div>
</div>

<!--
	The canvas (D31, CHAT-13).

	It holds the page's own components: the confirmation sheet and the
	transaction form, both in `panel` mode, which is the same markup the
	transactions page mounts in a sheet. A second rendering of either would
	be a second place for a validation rule to live, and the model would
	still have authored neither.
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

		<!-- The ordinary create, posted to the page that owns it. Without
		     script the browser follows the action and lands there, which is
		     the right place to end up. -->
		<TransactionFormSheet
			container="panel"
			bind:draft={manualDraft}
			bind:attachments={manualAttachments}
			accounts={accountItems}
			categories={categoryItems}
			{baseCurrency}
			walletCurrency={manualWalletCurrency}
			saving={confirming}
			action="/transactions?/create"
			enhance={(node) => enhance(node, afterCreate)}
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
			enhance={(node) => enhance(node, afterCreate)}
			onCancel={closeCanvas}
			onManualEntry={() => openCanvas('transaction', canvas?.id ?? '')}
			onParsed={(form) => (receiptForm = form)}
		/>
	{/if}
</ChatCanvas>

<Dialog.Root
	open={openFileId !== null}
	onOpenChange={(open) => {
		if (!open) openFileId = null;
	}}
>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{t('chat.attachments')}</Dialog.Title>
		</Dialog.Header>

		{#if openFile}
			<AttachmentView
				file={{
					id: openFile.id,
					file_id: openFile.id,
					name: openFile.name,
					type: openFile.type,
					size: openFile.size
				}}
			/>
		{:else}
			<p class="text-subtle text-body">{t('chat.attachment_missing')}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
