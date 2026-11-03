<script lang="ts">
	/**
	 * One conversation.
	 *
	 * Messages only: the input and the live turn arrive in US-028 and
	 * US-031, so the composer below is present and disabled rather than
	 * absent, which is what the page will look like.
	 */
	import { toMessageItem } from '$lib/chat';
	import { ChatMessages } from '$lib/components/organisms/chat';
	import { Button } from '$lib/components/atoms/button';
	import { Textarea } from '$lib/components/atoms/textarea';
	import { ScrollArea } from '$lib/components/atoms/scroll-area';
	import { t } from '$lib/i18n';

	let { data } = $props();

	const messages = $derived(data.conversation.messages.map((message) => toMessageItem(message)));
</script>

<div class="flex h-full min-h-0 flex-col gap-4">
	<header class="flex shrink-0 items-baseline justify-between gap-4">
		<h1 class="text-h2 truncate">{data.conversation.title}</h1>
	</header>

	<ScrollArea class="min-h-0 flex-1">
		<div class="pr-4 pb-4">
			<ChatMessages {messages} emptyBody={t('chat.empty_conversation')} />
		</div>
	</ScrollArea>

	<div class="flex shrink-0 flex-col gap-2 border-t pt-4">
		<p class="text-subtle text-caption">{t('chat.not_connected')}</p>
		<div class="flex items-end gap-2">
			<Textarea placeholder={t('chat.input_placeholder')} rows={2} disabled />
			<Button disabled>{t('chat.send')}</Button>
		</div>
	</div>
</div>
