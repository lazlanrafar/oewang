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
		ChatHistory,
		ChatMessages,
		ChatSuggestions,
		ToolCallGroup
	} from '$lib/components/organisms/chat';
	import { AppSidebar, ThemeToggle, WorkspaceSwitcher } from '$lib/components/organisms/layouts';

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
	title="Chat history"
	note="The conversation list: newest activity first, the open one marked, and a menu per row for renaming and deleting. Rename opens a dialog, delete asks first (UI-4)."
>
	<div class="max-w-sm">
		<ChatHistory
			sessions={chatSessions}
			activeId="s1"
			onNew={() => {}}
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
