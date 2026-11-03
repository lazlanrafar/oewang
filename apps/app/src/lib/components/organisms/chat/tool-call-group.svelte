<script lang="ts">
	/**
	 * What the assistant did, above what it said (CHAT-14).
	 *
	 * New in this app. The pattern is Midday's `tool-call-group.tsx`
	 * (docs/research/midday.md#16-tool-call-presentation): tool calls are
	 * progress, so they render as one line of plain English and never as
	 * JSON. The rule that picks the line is `presentToolCalls`, which is
	 * tested without a browser; this file is the layout for it.
	 *
	 * The arguments are deliberately not shown. They are the model's own
	 * words about what it was doing, the summary beside each finished call
	 * is the API's, and the API's is the one that happened.
	 */
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { presentToolCalls, toolLabel, type ToolCall } from '$lib/chat-tools';
	import { t } from '$lib/i18n';

	let { calls }: { calls: ToolCall[] } = $props();

	const view = $derived(presentToolCalls(calls));
	let expanded = $state(false);
</script>

{#if view}
	<div class="text-caption text-subtle flex flex-col gap-1">
		{#if view.running}
			<p class="flex items-center gap-2">
				<!-- The sweep is the skeleton's, over the label rather than
				     over a block. It stops under prefers-reduced-motion with
				     the blanket rule in app.css (D64). -->
				<span
					class="from-subtle via-foreground to-subtle animate-shimmer bg-linear-to-r bg-size-[200%_100%] bg-clip-text text-transparent"
				>
					{view.headline}
				</span>
			</p>
		{:else if view.collapsible}
			<button
				type="button"
				class="flex w-fit items-center gap-2"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				<Check class="size-3.5" aria-hidden="true" />
				<span>{view.headline}</span>
				<ChevronDown
					class="size-3.5 transition-transform {expanded ? 'rotate-180' : ''}"
					aria-hidden="true"
				/>
				<span class="sr-only">{expanded ? t('chat.tools_hide') : t('chat.tools_show')}</span>
			</button>
		{:else}
			<p class="flex items-center gap-2">
				{#if view.finished[0].status === 'failed'}
					<TriangleAlert class="text-destructive size-3.5" aria-hidden="true" />
				{:else}
					<Check class="size-3.5" aria-hidden="true" />
				{/if}
				<span>{view.headline}</span>
			</p>
		{/if}

		{#if expanded && view.collapsible}
			<ul class="border-border flex flex-col gap-1 border-l pl-3">
				{#each view.finished as call (call.id)}
					<li class="flex items-baseline gap-2">
						{#if call.status === 'failed'}
							<span class="text-destructive">{t('chat.tool_failed')}</span>
						{/if}
						<span>{toolLabel(call.name)}</span>
						{#if call.summary}
							<span class="min-w-0 truncate">{call.summary}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
