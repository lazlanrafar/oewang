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
	 */
	import { goto, invalidate, invalidateAll } from '$app/navigation';

	import { toast } from 'svelte-sonner';

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
	import { invalidateForToolCalls } from '$lib/chat-invalidation';
	import { toolLabel } from '$lib/chat-tools';
	import { ChatInput, ChatMessages, ChatSuggestions } from '$lib/components/organisms/chat';
	import * as Dialog from '$lib/components/atoms/dialog';
	import { ScrollArea } from '$lib/components/atoms/scroll-area';
	import { AttachmentView } from '$lib/components/molecules/attachment-view';
	import type { UploadedFile } from '$lib/components/molecules/file-dropzone';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import type { ChatRole } from '$lib/server/chat';

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
</script>

<div class="flex h-full min-h-0 flex-col gap-4">
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
