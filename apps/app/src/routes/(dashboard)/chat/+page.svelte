<script lang="ts">
	/**
	 * `/chat` with nothing to open yet.
	 *
	 * Reached only when the workspace has no conversations: the load
	 * redirects to the newest one otherwise.
	 */
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';

	import { Button } from '$lib/components/atoms/button';
	import * as Empty from '$lib/components/molecules/empty';
	import { t } from '$lib/i18n';
</script>

<Empty.Root class="h-full">
	<Empty.Header>
		<Empty.Media>
			<MessageSquarePlus />
		</Empty.Media>
		<Empty.Title>{t('chat.no_conversations')}</Empty.Title>
		<Empty.Description>{t('chat.empty_body')}</Empty.Description>
	</Empty.Header>

	<Empty.Content>
		<form method="POST" action="?/new">
			<Button type="submit">{t('chat.new_chat')}</Button>
		</form>
	</Empty.Content>
</Empty.Root>
