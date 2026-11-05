<script lang="ts">
	/**
	 * What the assistant is doing, live, while a turn works (CHAT-14).
	 *
	 * One line per tool as it is called, in order: a shimmering label and
	 * what the call covers while it runs, then a check and the API's own
	 * one-line summary once it answers. A last line says "Thinking" before
	 * anything has happened and "Reading the results" between the last tool
	 * and the first word. The old app showed one of these at a time; this
	 * keeps the steps, so the reader can follow the work.
	 *
	 * Every word here is the app's or the API's. The model's own narration
	 * stays suppressed (CHAT-14), and the arguments are only read for a date
	 * range or a search phrase (`toolDetail`).
	 *
	 * When the turn ends the message shows `ToolCallGroup` instead, folded.
	 */
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import type { TurnPhase } from '$lib/chat-stream';
	import { toolDetail, toolLabel, type ToolCall } from '$lib/chat-tools';
	import { t } from '$lib/i18n';

	import { Spinner } from '../../atoms/spinner/index.js';

	let { calls, phase }: { calls: ToolCall[]; phase: TurnPhase | null } = $props();
</script>

{#snippet shimmer(text: string)}
	<!-- The sweep is the skeleton's, over the words. It stops under
	     prefers-reduced-motion with the blanket rule in app.css (D64). -->
	<span
		class="from-subtle via-foreground to-subtle animate-shimmer bg-linear-to-r bg-size-[200%_100%] bg-clip-text text-transparent"
	>
		{text}
	</span>
{/snippet}

{#if calls.length > 0 || phase === 'thinking' || phase === 'reading'}
	<ol class="text-caption text-subtle flex flex-col gap-1.5" aria-label={t('chat.activity_label')}>
		{#each calls as call (call.id)}
			{@const detail = toolDetail(call)}
			<li class="flex flex-col">
				<span class="flex items-center gap-2">
					{#if call.status === 'running'}
						<Spinner class="size-3.5" />
						{@render shimmer(detail ? `${toolLabel(call.name)} · ${detail}` : toolLabel(call.name))}
					{:else if call.status === 'failed'}
						<TriangleAlert class="text-destructive size-3.5" aria-hidden="true" />
						<span>{toolLabel(call.name)}</span>
					{:else}
						<Check class="size-3.5" aria-hidden="true" />
						<span>{toolLabel(call.name)}{detail ? ` · ${detail}` : ''}</span>
					{/if}
				</span>
				{#if call.status !== 'running' && call.summary}
					<span class="text-subtle/80 ml-5.5 line-clamp-2">{call.summary}</span>
				{/if}
			</li>
		{/each}

		{#if phase === 'thinking' || phase === 'reading'}
			<li class="flex items-center gap-2">
				<Spinner class="size-3.5" />
				{@render shimmer(phase === 'thinking' ? t('chat.status_thinking') : t('chat.status_reading'))}
			</li>
		{/if}
	</ol>
{/if}
