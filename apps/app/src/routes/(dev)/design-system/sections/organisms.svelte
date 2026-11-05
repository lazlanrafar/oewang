<script lang="ts">
	/**
	 * Whole features, built from molecules and atoms, and the app's own
	 * furniture.
	 *
	 * The data table itself is a molecule and is shown once, there: a
	 * transactions table and an accounts table on this tab would be the same
	 * shell twice, which is the duplication the shell exists to remove. What
	 * is here is what a feature adds on top of it.
	 *
	 * Every figure arrives as a prop, from a JSON fixture: an organism holds
	 * no data and fetches nothing, which is exactly what lets it be shown on
	 * a page with no server behind it. If a component cannot be rendered
	 * here, it is reaching for something it should have been handed.
	 */
	import { Button } from '$lib/components/atoms/button';
	import {
		AccountDetailSheet,
		AccountFormSheet,
		AccountSummaryCards
	} from '$lib/components/organisms/accounts';
	import {
		ChatActivity,
		ChatHistory,
		ChatInput,
		ChatMessages,
		ChatSuggestions,
		ToolCallGroup
	} from '$lib/components/organisms/chat';
	import { AppSidebar, ThemeToggle, WorkspaceSwitcher } from '$lib/components/organisms/layouts';
	import { SettingsSidebar } from '$lib/components/organisms/settings';

	import {
		accountGroups,
		accountRates,
		accountSummary,
		accounts,
		baseCurrency,
		chatMessages,
		chatSessions,
		chatToolBatch,
		workspace
	} from '../mock';
	import Specimen from '../specimen.svelte';

	let formOpen = $state(false);
	let detailOpen = $state(false);
</script>

<Specimen
	title="Accounts summary cards"
	note="The three figures above the accounts table. Local rather than built on the stat card molecule: this one is a tracked 10px label over a serif figure and carries no change indicator. Every figure arrives formatted."
	source="organisms/accounts/accounts-summary-cards.svelte"
	framed={false}
>
	<AccountSummaryCards
		total={accountSummary.total}
		count={accountSummary.count}
		counted={accountSummary.counted}
		unconverted={accountSummary.unconverted}
	/>
</Specimen>

<Specimen
	title="Account sheets"
	note="The form sheet creates and edits; the detail sheet opens a row. Both post to the page's action rather than writing anything themselves, which is why they can be opened here with nothing behind them."
	source="organisms/accounts/accounts-form-sheet.svelte, accounts-detail-sheet.svelte"
>
	<div class="flex gap-3">
		<Button variant="outline" onclick={() => (formOpen = true)}>Open form sheet</Button>
		<Button variant="outline" onclick={() => (detailOpen = true)}>Open detail sheet</Button>
	</div>

	<AccountFormSheet
		bind:open={formOpen}
		account={accounts[2]}
		groups={accountGroups}
		{baseCurrency}
		currencyLocked
	/>
	<AccountDetailSheet
		bind:open={detailOpen}
		account={accounts[2]}
		groups={accountGroups}
		{baseCurrency}
		rates={accountRates}
	/>
</Specimen>

<Specimen
	title="Chat composer"
	note="The old app's composer (D87), shared by the overview and every conversation: a one-line field over add, shortcuts and history, and send, which becomes stop and shows a cross after a failure. Typing / opens the shortcuts. Files are picked or dropped anywhere and shown as thumbnails. Past a short scroll it folds to the field alone. The second copy is folded."
>
	<div class="bg-muted flex flex-col gap-6 p-6">
		<ChatInput onSend={() => {}} onStop={() => {}}>
			{#snippet history()}
				<ChatHistory
					sessions={chatSessions}
					activeId="s1"
					onRename={() => {}}
					onDelete={() => {}}
				/>
			{/snippet}
		</ChatInput>
		<ChatInput compact={1} onSend={() => {}} onStop={() => {}} />
	</div>
</Specimen>

<Specimen
	title="Chat activity"
	note="What a working turn is doing, live (CHAT-14): one line per tool, shimmering with what it covers while it runs, then checked with the API's summary. The last line says Thinking before anything comes back and Reading the results between the last tool and the first word. When the turn ends the message folds to the tool group instead."
>
	<div class="flex max-w-xl flex-col gap-6">
		<ChatActivity calls={[]} phase="thinking" />
		<ChatActivity
			calls={[
				{ id: 'a1', name: 'get_workspace_context', args: {}, status: 'ok', summary: '3 wallets, 12 categories.' },
				{ id: 'a2', name: 'get_spending_analysis', args: { from: '2026-09-01', to: '2026-11-30' }, status: 'running', summary: null }
			]}
			phase="working"
		/>
		<ChatActivity
			calls={[
				{ id: 'b1', name: 'get_spending_analysis', args: { from: '2026-09-01', to: '2026-11-30' }, status: 'ok', summary: 'Rp 50.394.000 spent across 183 transactions, up on the quarter before.' }
			]}
			phase="reading"
		/>
	</div>
</Specimen>

<Specimen
	title="Chat history"
	note="The conversation list as the old history dropdown: 32px rows, newest first, the open one marked, rename and delete on hover. In a conversation it opens from the composer's history button. Delete asks first (UI-4)."
>
	<div class="max-w-sm">
		<ChatHistory
			sessions={chatSessions}
			activeId="s1"
			onRename={() => {}}
			onDelete={() => {}}
		/>
	</div>
</Specimen>

<Specimen
	title="Chat messages"
	note="A stored conversation: the tools the assistant used above what it said, Markdown below it, entity links as buttons that open a sheet or a filter, and copy and ask-again underneath."
>
	<ChatMessages messages={chatMessages} onEntity={() => {}} onCopy={() => {}} />
</Specimen>

<Specimen
	title="Chat tool calls"
	note="Progress, never JSON. One finished call is a check and its label; several collapse to a count and expand; the call in flight shimmers."
>
	<div class="flex flex-col gap-3">
		<ToolCallGroup calls={[{ id: 't1', name: 'create_transaction', args: {}, status: 'ok', summary: 'Created expense 50,000 in Cash.' }]} />
		<ToolCallGroup calls={chatToolBatch} />
		<ToolCallGroup calls={[{ id: 't9', name: 'get_spending_summary', args: {}, status: 'running', summary: null }]} />
	</div>
</Specimen>

<Specimen
	title="Chat messages, empty"
	note="A conversation with nothing in it yet, and the three suggestions that start one."
>
	<div class="h-64">
		<ChatMessages messages={[]} onEntity={() => {}} onCopy={() => {}}>
			{#snippet emptyActions()}
				<ChatSuggestions onSelect={() => {}} />
			{/snippet}
		</ChatMessages>
	</div>
</Specimen>

<Specimen
	title="Sidebar"
	note="The app's own furniture, which is a feature rather than a primitive: it knows the navigation and the workspace. Expanded beside the icon rail it collapses to."
	source="organisms/layouts/layouts-sidebar.svelte"
	framed={false}
>
	<!-- The sidebar is `sticky top-0 h-svh`, which is right in the shell and
	     wrong in a specimen: unclipped it sticks to the viewport and covers
	     whatever follows it. `overflow-hidden` makes this box the scroll
	     container it sticks inside. -->
	<div class="flex h-96 gap-4 overflow-hidden">
		<AppSidebar name={workspace.name} secondary={workspace.secondary} class="border" />
		<AppSidebar name={workspace.name} secondary={workspace.secondary} collapsed class="border" />
	</div>
</Specimen>

<Specimen
	title="Settings sidebar"
	note="One level below the app sidebar, with the same row. A section not built yet is tagged Soon and not linked (D82)."
	source="organisms/settings/settings-sidebar.svelte"
>
	<SettingsSidebar class="w-56" />
</Specimen>

<Specimen
	title="Workspace switcher and theme toggle"
	note="The two controls at the ends of the sidebar."
>
	<div class="flex items-center gap-6">
		<div class="w-56 border p-2">
			<WorkspaceSwitcher name={workspace.name} secondary={workspace.secondary} />
		</div>
		<ThemeToggle />
	</div>
</Specimen>
