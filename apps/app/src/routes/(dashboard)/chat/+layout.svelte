<script lang="ts">
	/**
	 * The chat shell: the conversation list beside whatever is open.
	 *
	 * The list is a layout so it survives switching conversations, and its
	 * actions post to `/chat`, because a layout cannot own form actions.
	 * They are hidden forms submitted by the list's callbacks, the same way
	 * the transactions page drives its sheets.
	 */
	import { tick } from 'svelte';

	import { page } from '$app/state';

	import { toSessionItem } from '$lib/chat';
	import { ChatHistory } from '$lib/components/organisms/chat';
	import { Button } from '$lib/components/atoms/button';
	import { t } from '$lib/i18n';

	let { data, children } = $props();

	const sessions = $derived(data.sessions.map((session) => toSessionItem(session)));
	const activeId = $derived(page.params.id ?? null);

	let newForm = $state<HTMLFormElement | null>(null);
	let renameForm = $state<HTMLFormElement | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);
	let targetId = $state('');
	let targetTitle = $state('');

	/*
	 * The hidden inputs are bound to state, and state reaches the DOM on
	 * the next tick. Submitting in the same tick would post the previous
	 * values, which is an empty id on the first use.
	 */
	async function rename(id: string, title: string) {
		targetId = id;
		targetTitle = title;
		await tick();
		renameForm?.requestSubmit();
	}

	async function remove(id: string) {
		targetId = id;
		await tick();
		deleteForm?.requestSubmit();
	}
</script>

<div class="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
	<aside class="flex max-h-72 min-h-0 w-full shrink-0 flex-col lg:max-h-none lg:w-72">
		<ChatHistory
			{sessions}
			{activeId}
			onNew={() => newForm?.requestSubmit()}
			onRename={rename}
			onDelete={remove}
		/>
	</aside>

	<main class="flex min-h-0 min-w-0 flex-1 flex-col">
		{@render children?.()}
	</main>
</div>

<!-- The list's actions, submitted by its callbacks. -->
<form bind:this={newForm} method="POST" action="/chat?/new" class="hidden"></form>

<form bind:this={renameForm} method="POST" action="/chat?/rename" class="hidden">
	<input type="hidden" name="id" value={targetId} />
	<input type="hidden" name="title" value={targetTitle} />
</form>

<form bind:this={deleteForm} method="POST" action="/chat?/delete" class="hidden">
	<input type="hidden" name="id" value={targetId} />
</form>

<noscript>
	<!-- Starting a conversation needs no dialog, so it works without
	     scripting; renaming and deleting are dialogs and do not. -->
	<form method="POST" action="/chat?/new" class="mt-4">
		<Button type="submit" variant="outline">{t('chat.new_chat')}</Button>
	</form>
</noscript>
