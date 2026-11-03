<script lang="ts">
	/**
	 * The conversation column.
	 *
	 * Ported from the old app's `chat-messages.tsx`. What it renders per
	 * message, in order: the tools the assistant used, what it said, the
	 * files sent with it, and the actions under it.
	 *
	 * The assistant's text renders as Markdown, the user's never does. A
	 * message still streaming renders as plain text and becomes Markdown
	 * when the turn ends, because half a table is not a table (CHAT-2).
	 *
	 * Entity links are the one place this component reaches back out. The
	 * renderer turns `[Warung Tekko](#txn:clx1)` into a button carrying the
	 * scheme and the value, and nothing else into a link at all (SEC-11);
	 * one delegated handler here turns a click on that button into a target
	 * and hands it to the page. Delegated rather than bound per button
	 * because the buttons arrive inside `{@html}`, which has no components
	 * to attach handlers to.
	 */
	import type { Snippet } from 'svelte';

	import Bot from '@lucide/svelte/icons/bot';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	import type { MessageItem } from '$lib/chat';
	import { entityTargetFromDataset, type EntityTarget } from '$lib/chat-entities';
	import { t } from '$lib/i18n';
	import { renderAssistantMarkdown } from '$lib/markdown';

	import * as Empty from '../../molecules/empty/index.js';
	import MessageActions from './message-actions.svelte';
	import ToolCallGroup from './tool-call-group.svelte';

	let {
		messages,
		emptyTitle = t('chat.empty_title'),
		emptyBody = t('chat.empty_body'),
		streamingId = null,
		busy = false,
		onEntity,
		onCopy,
		onRegenerate,
		emptyActions
	}: {
		messages: MessageItem[];
		emptyTitle?: string;
		emptyBody?: string;
		/** The answer still arriving, if any. It renders as plain text. */
		streamingId?: string | null;
		/** A turn is running: asking again would race it. */
		busy?: boolean;
		onEntity: (target: EntityTarget) => void;
		onCopy: (message: MessageItem) => void;
		onRegenerate?: () => void;
		/** Suggestion chips, mounted by the page on an empty conversation. */
		emptyActions?: Snippet;
	} = $props();

	const rendered = (message: MessageItem) =>
		message.role === 'assistant' && message.id !== streamingId;

	/** The newest assistant message is the only one worth asking again. */
	const lastAssistantId = $derived(
		[...messages].reverse().find((message) => message.role === 'assistant')?.id ?? null
	);

	function dispatchEntity(event: MouseEvent) {
		const origin = event.target;
		if (!(origin instanceof Element)) return;

		const control = origin.closest<HTMLElement>('[data-entity-scheme]');
		if (!control) return;

		const target = entityTargetFromDataset(
			control.dataset.entityScheme,
			control.dataset.entityValue
		);
		// A scheme the renderer emitted but this app cannot open is left
		// alone rather than guessed at: `#navigate://evil.test` is refused
		// here, and the button does nothing.
		if (target) onEntity(target);
	}
</script>

{#if messages.length === 0}
	<Empty.Root class="h-full">
		<Empty.Header>
			<Empty.Media>
				<Sparkles />
			</Empty.Media>
			<Empty.Title>{emptyTitle}</Empty.Title>
			<Empty.Description>{emptyBody}</Empty.Description>
		</Empty.Header>

		{#if emptyActions}
			<Empty.Content>
				{@render emptyActions()}
			</Empty.Content>
		{/if}
	</Empty.Root>
{:else}
	<ol class="flex flex-col gap-6">
		{#each messages as message (message.id)}
			<li class="flex gap-3 {message.role === 'user' ? 'flex-row-reverse' : ''}">
				{#if message.role !== 'user'}
					<span
						class="bg-muted text-subtle flex size-8 shrink-0 items-center justify-center"
						aria-hidden="true"
					>
						<Bot class="size-4" />
					</span>
				{/if}

				<div class="flex max-w-[42rem] min-w-0 flex-col gap-1">
					<span class="text-subtle text-caption {message.role === 'user' ? 'text-right' : ''}">
						{message.who} · {message.at}
					</span>

					{#if message.toolCalls.length > 0}
						<ToolCallGroup calls={message.toolCalls} />
					{/if}

					{#if message.content !== ''}
						{#if rendered(message)}
							<!-- Built by `renderAssistantMarkdown`, which escapes the
							     model's own text on the way through: no raw HTML is
							     ever parsed and no link but ours survives (SEC-11).
							     The click handler below reaches only the buttons it
							     wrote, each of which is a real button and so is
							     already reachable by keyboard. -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div class="markdown text-body" onclick={dispatchEntity}>
								{@html renderAssistantMarkdown(message.content, { entityLinks: true })}
							</div>
						{:else}
							<p
								class="text-body whitespace-pre-wrap {message.role === 'user'
									? 'bg-muted px-3 py-2'
									: ''}"
							>
								{message.content}
							</p>
						{/if}
					{/if}

					{#if message.files.length > 0}
						<ul
							class="flex flex-wrap gap-2 {message.role === 'user' ? 'justify-end' : ''}"
							aria-label={t('chat.attachments')}
						>
							{#each message.files as file (file.id)}
								<li>
									<button
										type="button"
										class="border-border text-caption flex items-center gap-1.5 border px-2 py-1"
										title={t('chat.attachment_open', { name: file.name })}
										onclick={() => onEntity({ kind: 'file', id: file.id })}
									>
										<Paperclip class="size-3.5" aria-hidden="true" />
										<span class="max-w-40 truncate">{file.name}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}

					{#if message.role === 'assistant' && message.id !== streamingId && message.content !== ''}
						<MessageActions
							{busy}
							onCopy={() => onCopy(message)}
							onRegenerate={message.id === lastAssistantId ? onRegenerate : undefined}
						/>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
{/if}

<style>
	/*
	 * Scoped styles do not reach `{@html}` content, so these are global
	 * inside the `.markdown` wrapper. The values are the design system's
	 * own: no rounding, no typography plugin.
	 */
	.markdown :global(p) {
		margin-bottom: 0.75rem;
	}

	.markdown :global(p:last-child) {
		margin-bottom: 0;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		margin: 0 0 0.75rem 1.25rem;
		list-style: revert;
	}

	.markdown :global(table) {
		width: 100%;
		margin-bottom: 0.75rem;
		border-collapse: collapse;
	}

	.markdown :global(th),
	.markdown :global(td) {
		border: 1px solid var(--border);
		padding: 0.25rem 0.5rem;
		text-align: left;
	}

	.markdown :global(code) {
		background: var(--muted);
		padding: 0.1rem 0.3rem;
		font-family: var(--font-mono);
	}

	.markdown :global(pre) {
		background: var(--muted);
		margin-bottom: 0.75rem;
		overflow-x: auto;
		padding: 0.75rem;
	}

	.markdown :global(pre code) {
		background: none;
		padding: 0;
	}

	.markdown :global(blockquote) {
		border-left: 2px solid var(--border);
		padding-left: 0.75rem;
	}

	/*
	 * An entity link. It reads as a link because it goes somewhere, and it
	 * is a button because what it opens is a sheet or a filter rather than
	 * a document (D33).
	 */
	.markdown :global(button[data-entity-scheme]) {
		color: inherit;
		font: inherit;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
</style>
