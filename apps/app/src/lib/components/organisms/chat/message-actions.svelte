<script lang="ts">
	/**
	 * Copy and ask again, under an assistant message.
	 *
	 * Ported from the old app's `chat-message-actions.tsx`, which also
	 * carried thumbs up and down, a share menu and a model switcher. None of
	 * those have anywhere to go in this product: there is no feedback
	 * endpoint, no sharing and one model (docs/features/chat.md#ui-port-map).
	 *
	 * Both actions are callbacks. The page owns the conversation, so it is
	 * the page that decides what asking again means.
	 */
	import Copy from '@lucide/svelte/icons/copy';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';

	import { Button } from '../../atoms/button/index.js';
	import { t } from '$lib/i18n';

	let {
		onCopy,
		onRegenerate,
		/** A turn is running: asking again now would race it. */
		busy = false
	}: {
		onCopy: () => void;
		onRegenerate?: () => void;
		busy?: boolean;
	} = $props();
</script>

<div class="flex items-center gap-1">
	<Button variant="ghost" size="icon" class="size-7" title={t('chat.copy')} onclick={onCopy}>
		<Copy class="size-3.5" />
		<span class="sr-only">{t('chat.copy')}</span>
	</Button>

	{#if onRegenerate}
		<Button
			variant="ghost"
			size="icon"
			class="size-7"
			title={t('chat.regenerate')}
			disabled={busy}
			onclick={onRegenerate}
		>
			<RefreshCw class="size-3.5" />
			<span class="sr-only">{t('chat.regenerate')}</span>
		</Button>
	{/if}
</div>
