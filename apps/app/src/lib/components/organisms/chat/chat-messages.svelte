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

	import PanelRight from '@lucide/svelte/icons/panel-right';
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	import type { MessageItem } from '$lib/chat';
	import type { TurnPhase } from '$lib/chat-stream';
	import { entityTargetFromDataset, type EntityTarget } from '$lib/chat-entities';
	import { t } from '$lib/i18n';
	import { renderAssistantMarkdown } from '$lib/markdown';

	import * as Empty from '../../molecules/empty/index.js';
	import { artifactTitle } from './canvas/artifact-title.js';
	import ChatActivity from './chat-activity.svelte';
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
		onArtifact,
		activeArtifactId = null,
		activity = null,
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
		/** Open the analysis a tool call left in the canvas (D88). */
		onArtifact?: (id: string) => void;
		/** The analysis the canvas is showing, so its toggle reads as pressed. */
		activeArtifactId?: string | null;
		/** What the answer still arriving is doing, for its live activity lines. */
		activity?: TurnPhase | null;
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
			<!-- The old app's shape: the user's words in a bubble on the right,
			     the answer as plain text on the left. Who and when stay for a
			     screen reader, which has no alignment to go by. -->
			<li class="flex {message.role === 'user' ? 'justify-end' : ''}">
				<div
					class="flex min-w-0 flex-col gap-1 {message.role === 'user'
						? 'max-w-[85%] items-end'
						: 'w-full'}"
				>
					<span class="sr-only">{message.who} · {message.at}</span>

					{#if message.id === streamingId}
						<ChatActivity calls={message.toolCalls} phase={activity} />
					{:else if message.toolCalls.length > 0}
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
									? 'bg-muted rounded-2xl rounded-br-none px-4 py-2'
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

					{#if onArtifact && message.toolCalls.some((call) => call.artifact)}
						<ul class="flex flex-wrap gap-2">
							{#each message.toolCalls as call (call.id)}
								{#if call.artifact}
									<li>
										<button
											type="button"
											class="border-border text-caption hover:border-foreground/40 flex items-center gap-1.5 border px-2 py-1 transition-colors {call.id ===
											activeArtifactId
												? 'bg-muted'
												: ''}"
											aria-pressed={call.id === activeArtifactId}
											onclick={() => onArtifact(call.id)}
										>
											<PanelRight class="size-3.5" aria-hidden="true" />
											{artifactTitle(call.artifact)}
										</button>
									</li>
								{/if}
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
	 * inside the `.markdown` wrapper. Colour tokens are HSL triples in
	 * app.css, so each goes through `hsl()`; a bare `var(--border)` is not a
	 * colour and draws nothing.
	 *
	 * Reading comes first: a line height with room, and a full blank line
	 * between paragraphs, so an answer reads as paragraphs rather than as
	 * one block.
	 */
	.markdown {
		line-height: 1.7;
	}

	.markdown :global(p),
	.markdown :global(ul),
	.markdown :global(ol),
	.markdown :global(pre),
	.markdown :global(blockquote),
	.markdown :global(.markdown-table) {
		margin-bottom: 1rem;
	}

	.markdown :global(:is(p, ul, ol, pre, blockquote, .markdown-table):last-child) {
		margin-bottom: 0;
	}

	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3),
	.markdown :global(h4) {
		font-family: var(--font-serif);
		font-size: 1.125rem;
		line-height: 1.4;
		margin: 1.5rem 0 0.5rem;
	}

	.markdown :global(:is(h1, h2, h3, h4):first-child) {
		margin-top: 0;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.25rem;
		list-style: revert;
	}

	.markdown :global(li + li) {
		margin-top: 0.375rem;
	}

	.markdown :global(strong) {
		font-weight: 600;
	}

	/*
	 * Tables as the canvas draws them: a border on every cell, room inside
	 * each, the header in the subtle colour. Figures line up on their
	 * digits. A column the model marked right-aligned (`---:`) keeps it.
	 */
	.markdown :global(.markdown-table) {
		max-width: 100%;
		overflow-x: auto;
	}

	.markdown :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
		line-height: 1.4;
		font-variant-numeric: tabular-nums;
	}

	.markdown :global(th),
	.markdown :global(td) {
		border: 1px solid hsl(var(--border));
		padding: 0.4375rem 0.75rem;
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}

	.markdown :global(th) {
		color: hsl(var(--subtle));
		font-weight: 500;
	}

	.markdown :global(th[style*='right']),
	.markdown :global(td[style*='right']) {
		text-align: right;
	}

	.markdown :global(code) {
		background: hsl(var(--muted));
		padding: 0.1rem 0.3rem;
		font-family: var(--font-mono);
	}

	.markdown :global(pre) {
		background: hsl(var(--muted));
		overflow-x: auto;
		padding: 0.75rem;
	}

	.markdown :global(pre code) {
		background: none;
		padding: 0;
	}

	.markdown :global(blockquote) {
		border-left: 2px solid hsl(var(--border));
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
