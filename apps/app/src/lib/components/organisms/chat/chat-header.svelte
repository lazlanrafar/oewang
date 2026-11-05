<script lang="ts">
	/**
	 * The bar over a conversation: back to the overview, the title, a new chat.
	 *
	 * Ported from the old app's `chat-header.tsx`. New chat posts the same
	 * form the history uses, so it works without script.
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Plus from '@lucide/svelte/icons/plus';

	import { t } from '$lib/i18n';

	import { Button } from '../../atoms/button/index.js';

	let { title }: { title: string } = $props();
</script>

<header class="bg-background/80 sticky top-0 z-10 -mx-4 -mt-4 flex items-center gap-3 px-4 py-2 backdrop-blur-sm md:-mx-6 md:-mt-6 md:px-6">
	<Button href="/overview" variant="outline" size="icon" class="size-8" title={t('chat.back')}>
		<ArrowLeft />
		<span class="sr-only">{t('chat.back')}</span>
	</Button>

	<h1 class="text-small min-w-0 flex-1 truncate text-center font-medium">{title}</h1>

	<form method="POST" action="/chat?/new">
		<Button type="submit" variant="outline" size="icon" class="size-8" title={t('chat.new_chat_hint')}>
			<Plus />
			<span class="sr-only">{t('chat.new_chat')}</span>
		</Button>
	</form>
</header>
