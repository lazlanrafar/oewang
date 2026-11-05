<script lang="ts">
	/**
	 * The assistant's shell, shared by the overview and every conversation
	 * (D87): the conversation list and its actions, for the composer's
	 * history button on both.
	 *
	 * The list is loaded by the layout so it survives switching
	 * conversations, and its actions post to `/chat`, because a layout cannot
	 * own form actions. They are hidden forms submitted by the list's
	 * callbacks, the same way the transactions page drives its sheets. Each
	 * carries the page it was sent from, so the action returns there.
	 */
	import { setContext, tick } from 'svelte';

	import { page } from '$app/state';

	import { CHAT_HISTORY, toSessionItem, type ChatHistoryContext } from '$lib/chat';

	let { data, children } = $props();

	const sessions = $derived(data.sessions.map((session) => toSessionItem(session)));
	const activeId = $derived(page.params.id ?? null);

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

	setContext<ChatHistoryContext>(CHAT_HISTORY, {
		get sessions() {
			return sessions;
		},
		get activeId() {
			return activeId;
		},
		onRename: rename,
		onDelete: remove
	});
</script>

<!--
	The history is no longer a column (D87): it opens from the composer, as
	the old app's did, so the conversation has the width. The list and its
	actions are published to the page through context, because the composer
	lives in the page and a layout cannot pass props to it.
-->
{@render children?.()}

<!-- The list's actions, submitted by its callbacks. -->
<form bind:this={renameForm} method="POST" action="/chat?/rename" class="hidden">
	<input type="hidden" name="back" value={page.url.pathname + page.url.search} />
	<input type="hidden" name="id" value={targetId} />
	<input type="hidden" name="title" value={targetTitle} />
</form>

<form bind:this={deleteForm} method="POST" action="/chat?/delete" class="hidden">
	<input type="hidden" name="back" value={page.url.pathname + page.url.search} />
	<input type="hidden" name="id" value={targetId} />
</form>


