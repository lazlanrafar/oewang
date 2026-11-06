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
		BudgetFormSheet,
		BudgetMonthStepper,
		BudgetSummaryCards
	} from '$lib/components/organisms/budgets';
	import { ArtifactCanvas } from '$lib/components/organisms/chat/canvas';
	import {
		ChatActivity,
		ChatHistory,
		ChatInput,
		ChatMessages,
		ChatSuggestions,
		ToolCallGroup
	} from '$lib/components/organisms/chat';
	import { AccountMenu, AppSidebar, ThemeToggle, WorkspaceSwitcher } from '$lib/components/organisms/layouts';
	import { McpSetup, McpTokensList, type McpClient } from '$lib/components/organisms/mcp';
	import { MembersInviteSheet, MembersInvitesTable, MembersTable } from '$lib/components/organisms/members';
	import { SettingsSidebar } from '$lib/components/organisms/settings';

	import {
		accountGroups,
		accountRates,
		accountSummary,
		accounts,
		baseCurrency,
		budgetStatus,
		chatMessages,
		chatSessions,
		chatToolBatch,
		workspace
	} from '../mock';
	import Specimen from '../specimen.svelte';

	/* Two workspaces, so the switcher's menu has something to switch to. */
	const workspaces = [
		{ id: 'w1', name: workspace.name, role: 'owner' },
		{ id: 'w2', name: 'Side project', role: 'member' }
	];

	let formOpen = $state(false);
	let detailOpen = $state(false);
	let budgetFormOpen = $state(false);
	let budgetMonth = $state(budgetStatus.month);

	/* Members specimen data: an admin looking, so the owner row has no menu. */
	const MEMBERS = [
		{ user_id: 'u0', email: 'owner@example.com', name: 'Sample owner', role: 'owner' as const, joined_at: '2026-01-04T00:00:00Z' },
		{ user_id: 'u1', email: 'admin@example.com', name: 'Sample admin', role: 'admin' as const, joined_at: '2026-03-12T00:00:00Z' },
		{ user_id: 'u2', email: 'reader@example.com', name: null, role: 'member' as const, joined_at: '2026-10-30T00:00:00Z' }
	];
	const INVITES = [
		{ id: 'i1', email: 'colleague@example.com', role: 'member' as const, expires_at: '2026-11-13T00:00:00Z', created_at: '2026-11-06T00:00:00Z' }
	];
	let inviteOpen = $state(false);

	/* MCP specimen data: one token for every workspace, one for a pick. */
	const MCP_WORKSPACES = [
		{ id: 'w1', name: 'Personal' },
		{ id: 'w2', name: 'Studio' }
	];
	const MCP_TOKENS = [
		{ id: 't1', kind: 'pat' as const, name: 'Claude Code on my laptop', client_id: null, token_prefix: 'owm_example1', workspace_ids: null, expires_at: '2027-02-04T00:00:00Z', last_used_at: '2026-11-06T08:00:00Z', created_at: '2026-11-06T07:00:00Z' },
		{ id: 't2', kind: 'pat' as const, name: 'Cursor', client_id: null, token_prefix: 'owm_example2', workspace_ids: ['w2'], expires_at: null, last_used_at: null, created_at: '2026-11-01T07:00:00Z' }
	];
	let mcpClient = $state<McpClient>('claude-code');
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
	title="Budget summary cards"
	note="The three figures above the budget table (D103): the month's total limit, what was spent, and the share used, amber from 80% and red past 100%. The accounts cards' look; every figure and the state are the API's."
	source="organisms/budgets/budgets-summary-cards.svelte"
	framed={false}
>
	<BudgetSummaryCards status={budgetStatus} />
</Specimen>

<Specimen
	title="Budget month and form"
	note="The month stepper sits beside New budget and writes ?month= (UI-8); it steps from the YYYY-MM parts, never through Date. The form sheet takes an expense category, fixed once the budget exists, and a monthly limit in the workspace currency."
	source="organisms/budgets/budgets-month-stepper.svelte, budgets-form-sheet.svelte"
>
	<div class="flex items-center gap-3">
		<BudgetMonthStepper month={budgetMonth} onChange={(month) => (budgetMonth = month)} />
		<Button variant="outline" onclick={() => (budgetFormOpen = true)}>Open form sheet</Button>
	</div>
	<BudgetFormSheet
		bind:open={budgetFormOpen}
		budget={budgetStatus.budgets[1]}
		currency={budgetStatus.currency_code}
	/>
</Specimen>

<Specimen
	title="Budget canvas"
	note="The chat's budget panel (D103), the old canvas: spent and remaining, a bar per budget with the fullest first in the page's colours, and the API's summary. Built from the same report as the budget page, so the two cannot disagree."
	source="organisms/chat/canvas/canvas-budget.svelte"
>
	<div class="max-w-xl border">
		<ArtifactCanvas entry={{ id: 'toolu_budget', kind: 'budget', payload: budgetStatus }} />
	</div>
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
		<AppSidebar {workspaces} activeId="w1" class="border" />
		<AppSidebar {workspaces} activeId="w1" collapsed class="border" />
	</div>
</Specimen>

<Specimen
	title="Settings sidebar"
	note="One level below the app sidebar, with the same row. A section not built yet is tagged Soon and not linked (D82); sections nobody plans to build are not listed (D104)."
	source="organisms/settings/settings-sidebar.svelte"
>
	<SettingsSidebar class="w-56" />
</Specimen>

<Specimen
	title="MCP setup and tokens"
	note="The account area's MCP section (D106): the server URL and each client's config with a placeholder for the token, then the person's tokens with their reach, last use and expiry. A token itself is shown once, in the sheet that makes it."
	source="organisms/mcp/"
>
	<div class="grid max-w-2xl gap-6">
		<McpSetup url="https://app.oewang.com/mcp" client={mcpClient} onClientChange={(next) => (mcpClient = next)} />
		<McpTokensList tokens={MCP_TOKENS} workspaces={MCP_WORKSPACES} empty="No tokens yet." onRevoke={() => {}} />
	</div>
</Specimen>

<Specimen
	title="Members and invitations"
	note="The old members page in a settings section (WS-3, D104). The row menu changes a role or removes; it is absent on your own row and, for an admin, on an owner's. The sheet shows the link once an invitation is sent, the only time the token can be read."
	source="organisms/members/"
>
	<div class="grid max-w-2xl gap-6">
		<MembersTable
			members={MEMBERS}
			viewerId="u1"
			viewerRole="admin"
			empty="No members match."
		/>
		<MembersInvitesTable invites={INVITES} empty="No pending invitations." />
		<div>
			<Button variant="outline" onclick={() => (inviteOpen = true)}>Open the invite sheet</Button>
		</div>
	</div>
	<MembersInviteSheet bind:open={inviteOpen} viewerRole="owner" />
</Specimen>

<Specimen
	title="Workspace switcher, account menu and theme toggle"
	note="The old app's switcher (D94): the cat tile, the workspace over its role, a menu of workspaces with the current one ticked, Add workspace and Manage workspaces. Switching posts a plain form, so it does nothing useful here. The account menu is the old avatar menu: Account, Theme, Log out."
>
	<div class="flex items-center gap-6">
		<div class="w-56 border">
			<WorkspaceSwitcher {workspaces} activeId="w1" />
		</div>
		<AccountMenu name="Sample person" email={workspace.secondary} photo={null} />
		<ThemeToggle />
	</div>
</Specimen>
