<script lang="ts">
	/**
	 * The overview (D87): two tabs over one range, and the assistant's
	 * composer floating under them.
	 *
	 * Ported from the old app's `overview` page. The old page turned itself
	 * into the conversation in place; here a question starts a session and
	 * opens it, so there is one chat screen and the back button returns
	 * here. The question travels by `$lib/chat-handoff` and is sent by the
	 * conversation page as it mounts.
	 *
	 * Everything about the view is in the URL: the tab and the range (UI-8).
	 */
	import { deserialize } from '$app/forms';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { getContext, untrack } from 'svelte';

	import { parseDate } from '@internationalized/date';
	import { toast } from 'svelte-sonner';

	import { CHAT_HISTORY, type ChatHistoryContext } from '$lib/chat';
	import { handOff } from '$lib/chat-handoff';
	import { ChatDock, ChatHistory, ChatInput } from '$lib/components/organisms/chat';
	import {
		OVERVIEW_TABS,
		OverviewCards,
		OverviewChips,
		OverviewHeader,
		OverviewMetrics,
		type OverviewTab
	} from '$lib/components/organisms/overview';
	import type { UploadedFile } from '$lib/components/molecules/file-dropzone';
	import { t } from '$lib/i18n';
	import { notInPlan } from '$lib/plans';
	import { featureGate } from '$lib/workspace-data.svelte';
	import { currentMonth } from '$lib/month-range';
	import { pageTitle } from '$lib/page-title';
	import { rangeLabel } from '$lib/reports';
	import { readParam, readText, writeParams } from '$lib/url-state';

	let { data } = $props();

	const gate = featureGate();
	const chatOff = $derived(gate('chat'));

	const chatHistory = getContext<ChatHistoryContext>(CHAT_HISTORY);

	/*
	 * The tab is view state with no data behind it: both tabs read the same
	 * report. So switching writes `?tab=` with shallow routing, which keeps
	 * the URL shareable (UI-8) without rerunning a single load. A real
	 * navigation, back or forward included, reads it again.
	 */
	let tab = $state<OverviewTab>(readParam(page.url, 'tab', OVERVIEW_TABS, 'overview'));

	$effect(() => {
		tab = readParam(page.url, 'tab', OVERVIEW_TABS, 'overview');
	});

	function switchTab(next: OverviewTab) {
		tab = next;
		const url = new URL(page.url.href);
		if (next === 'overview') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		replaceState(url, page.state);
	}

	let draft = $state('');
	let attached = $state<UploadedFile[]>([]);
	let starting = $state(false);

	const name = $derived(
		data.me.user.name?.trim().split(/\s+/)[0] || data.me.user.email.split('@')[0]
	);
	const range = $derived({
		start: parseDate(data.range.start),
		end: parseDate(data.range.end)
	});
	const words = $derived(rangeLabel(data.range.start, data.range.end));

	/*
	 * Without `?from&to` the load opens on the server's UTC month. When the
	 * reader's own calendar is in another month (near midnight at a month's
	 * end, far from UTC), the page writes theirs, as /debts does `today`.
	 */
	$effect(() => {
		if (readText(page.url, 'from') || readText(page.url, 'to')) return;
		const local = currentMonth();
		if (data.range.start !== local.start) {
			untrack(() => writeParams({ from: local.start, to: local.end }));
		}
	});

	/**
	 * Start a conversation with this question and open it.
	 *
	 * The ordinary `?/new` action, posted the way `use:enhance` would, so
	 * creating a session stays in one place. The redirect it answers with
	 * names the session; the handoff is left for that session only.
	 */
	async function ask(message: string) {
		if (starting) return;
		// The cards ask too; without `chat` they say why rather than open a
		// conversation that cannot answer (PLN-7).
		if (chatOff) {
			toast.error(notInPlan(chatOff));
			return;
		}
		starting = true;

		try {
			const response = await fetch('/chat?/new', {
				method: 'POST',
				headers: { 'x-sveltekit-action': 'true' },
				body: new FormData()
			});
			const result = deserialize(await response.text());

			if (result.type !== 'redirect') {
				toast.error(t('overview.start_failed'));
				return;
			}

			const sessionId = result.location.split('/').pop() ?? '';
			handOff(sessionId, { message, files: attached });
			draft = '';
			attached = [];
			await goto(result.location);
		} catch {
			toast.error(t('overview.start_failed'));
		} finally {
			starting = false;
		}
	}
</script>

<svelte:head><title>{pageTitle(t('nav.overview'))}</title></svelte:head>

<div class="flex w-full flex-1 flex-col gap-6">
	<OverviewHeader
		{name}
		{tab}
		{range}
		onTab={switchTab}
		onRange={(next) => {
			// A half-picked range is still being picked.
			if (!next?.start || !next?.end) return;
			void writeParams({ from: next.start.toString(), to: next.end.toString() });
		}}
	/>

	{#if tab === 'metrics'}
		<OverviewMetrics overview={data.overview} />
	{:else}
		<OverviewCards
			overview={data.overview}
			balance={data.balance}
			debts={data.debts}
			onAsk={ask}
		/>
		<OverviewChips range={words} disabled={starting || chatOff !== null} onAsk={ask} />
	{/if}
</div>

<ChatDock minimize>
	{#snippet children({ compact })}
		<ChatInput
			bind:value={draft}
			bind:files={attached}
			{compact}
			disabled={starting}
			placeholder={starting ? t('overview.starting') : t('chat.input_placeholder')}
			onSend={ask}
			onStop={() => {}}
		>
			{#snippet history({ close })}
				<ChatHistory
					sessions={chatHistory.sessions}
					onOpen={close}
					onRename={chatHistory.onRename}
					onDelete={chatHistory.onDelete}
				/>
			{/snippet}
		</ChatInput>
	{/snippet}
</ChatDock>
