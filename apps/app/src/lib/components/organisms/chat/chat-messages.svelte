<script lang="ts">
	/**
	 * The conversation column.
	 *
	 * Ported from the old app's `chat-messages.tsx`, minus everything that
	 * belongs to a live turn: Markdown rendering, copy and regenerate, tool
	 * cards and entity links arrive with the stream in US-028 and US-031.
	 * What is here is what a stored conversation needs to be readable.
	 */
	import Bot from '@lucide/svelte/icons/bot';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	import type { MessageItem } from '$lib/chat';
	import { t } from '$lib/i18n';

	import * as Empty from '../../molecules/empty/index.js';

	let {
		messages,
		emptyTitle = t('chat.empty_title'),
		emptyBody = t('chat.empty_body')
	}: {
		messages: MessageItem[];
		emptyTitle?: string;
		emptyBody?: string;
	} = $props();
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
					<!-- Plain text until the sanitized Markdown renderer lands
					     with the stream (US-031, SEC-11). -->
					<p
						class="text-body whitespace-pre-wrap {message.role === 'user'
							? 'bg-muted px-3 py-2'
							: ''}"
					>
						{message.content}
					</p>
				</div>
			</li>
		{/each}
	</ol>
{/if}
