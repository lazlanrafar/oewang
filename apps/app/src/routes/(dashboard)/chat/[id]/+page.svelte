<script lang="ts">
	/**
	 * One conversation, with the live turn (US-028, CHAT-2, CHAT-9).
	 *
	 * The stored messages arrive from the server load, so a reload shows the
	 * conversation without this code running at all. What is added here is
	 * the turn in flight: the question appears at once, the answer grows as
	 * tokens arrive, and the stop button ends it.
	 *
	 * The browser never talks to the API (D5). `/chat/stream` beside this
	 * route is the only hop it knows about.
	 *
	 * The answer renders as plain text while it arrives and as Markdown once
	 * the turn ends: half a table is not a table. The rendering itself is
	 * `$lib/markdown`, which never parses raw HTML (SEC-11).
	 */
	import { invalidateAll } from '$app/navigation';

	import { advance, IDLE_TURN, isActive, readFrames, type Turn } from '$lib/chat-stream';
	import { toMessageItem, type MessageItem } from '$lib/chat';
	import { ChatInput, ChatMessages } from '$lib/components/organisms/chat';
	import { ScrollArea } from '$lib/components/atoms/scroll-area';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import type { ChatRole } from '$lib/server/chat';

	let { data } = $props();

	let draft = $state('');
	let turn = $state<Turn>(IDLE_TURN);
	/** The question, shown before the server has a row for it. */
	let asked = $state<MessageItem | null>(null);
	/** One clock reading per turn, so the timestamps do not tick per token. */
	let startedAt = $state('');
	let foot = $state<HTMLDivElement | null>(null);

	let abort: AbortController | null = null;
	let storedBefore = 0;

	const stored = $derived(data.conversation.messages.map((message) => toMessageItem(message)));

	/*
	 * The answer so far. It appears with its first token rather than as an
	 * empty bubble; until then the status line below says what is happening.
	 */
	const answering = $derived(
		turn.text === '' ? null : local('assistant', turn.text, 'turn-assistant')
	);

	const messages = $derived([
		...stored,
		...(asked ? [asked] : []),
		...(answering ? [answering] : [])
	]);

	const status = $derived(statusLabel(turn));

	function local(role: ChatRole, content: string, id: string): MessageItem {
		return toMessageItem({ id, role, content, created_at: startedAt });
	}

	function statusLabel(current: Turn): string {
		if (current.status === 'sending') return t('chat.status_sending');
		if (current.status === 'streaming') return t('chat.status_streaming');
		if (current.status === 'stopped') return t('chat.status_stopped');
		return '';
	}

	/* Follow the answer down as it grows. */
	$effect(() => {
		// Read what changes, so the effect runs per token.
		void turn.text;
		void messages.length;
		foot?.scrollIntoView({ block: 'end', behavior: 'auto' });
	});

	async function send(message: string) {
		if (isActive(turn)) return;

		startedAt = new Date().toISOString();
		asked = local('user', message, 'turn-user');
		turn = advance(turn, { kind: 'send' });
		draft = '';
		storedBefore = data.conversation.messages.length;

		abort = new AbortController();

		try {
			const response = await fetch('/chat/stream', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ session_id: data.conversation.id, message }),
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
			/>
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

		<ChatInput bind:value={draft} streaming={isActive(turn)} onSend={send} onStop={stop} />
	</div>
</div>
