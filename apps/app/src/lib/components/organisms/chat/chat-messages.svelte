<script lang="ts">
	/**
	 * The conversation column.
	 *
	 * Ported from the old app's `chat-messages.tsx`, minus what belongs to a
	 * live turn: copy and regenerate, tool cards and the entity link
	 * handlers arrive in US-031.
	 *
	 * The assistant's text renders as Markdown, the user's never does. A
	 * message still streaming renders as plain text and becomes Markdown
	 * when the turn ends, because half a table is not a table (CHAT-2).
	 */
	import Bot from '@lucide/svelte/icons/bot';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	import type { MessageItem } from '$lib/chat';
	import { t } from '$lib/i18n';
	import { renderAssistantMarkdown } from '$lib/markdown';

	import * as Empty from '../../molecules/empty/index.js';

	let {
		messages,
		emptyTitle = t('chat.empty_title'),
		emptyBody = t('chat.empty_body'),
		streamingId = null
	}: {
		messages: MessageItem[];
		emptyTitle?: string;
		emptyBody?: string;
		/** The answer still arriving, if any. It renders as plain text. */
		streamingId?: string | null;
	} = $props();

	const rendered = (message: MessageItem) =>
		message.role === 'assistant' && message.id !== streamingId;
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
					{#if rendered(message)}
						<!-- Built by `renderAssistantMarkdown`, which escapes the
						     model's own text on the way through: no raw HTML is
						     ever parsed and no link but ours survives (SEC-11). -->
						<div class="markdown text-body">
							{@html renderAssistantMarkdown(message.content)}
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
</style>
