<script lang="ts">
	/**
	 * Whole features, built from molecules and atoms.
	 *
	 * The rows here are mock, and the table takes them as a prop: the
	 * component itself holds no data and fetches nothing, which is what lets
	 * it be shown on a page with no server behind it.
	 */
	import type { MessageItem, SessionItem } from '$lib/chat';
	import type { ToolCall } from '$lib/chat-tools';
	import {
		ChatHistory,
		ChatMessages,
		ChatSuggestions,
		ToolCallGroup
	} from '$lib/components/organisms/chat';
	import { TransactionsTable } from '$lib/components/molecules/data-table';
	import type { NamedOption, TransactionRow } from '$lib/components/molecules/data-table';

	let { heading }: { heading: import('svelte').Snippet<[string, string?]> } = $props();

	const categories: NamedOption[] = [
		{ id: 'food', name: 'Food', colorClass: 'bg-red' },
		{ id: 'transport', name: 'Transport', colorClass: 'bg-subtle' },
		{ id: 'shopping', name: 'Shopping', colorClass: 'bg-primary' },
		{ id: 'bills', name: 'Bills', colorClass: 'bg-destructive' },
		{ id: 'salary', name: 'Salary', colorClass: 'bg-green' }
	];

	const chatSessions: SessionItem[] = [
		{ id: 's1', title: 'Food spending last month', when: '2 minutes ago', preview: 'You spent Rp 1.240.000 on Food.' },
		{ id: 's2', title: 'Wise balance', when: 'yesterday', preview: '4 messages' },
		{ id: 's3', title: 'New chat', when: '28 Oct', preview: 'No messages' }
	];

	const chatMessages: MessageItem[] = [
		{ id: 'm1', role: 'user', content: 'How much did I spend on food last month?', at: '09:14', who: 'You', toolCalls: [], files: [] },
		{
			id: 'm2',
			role: 'assistant',
			content:
				'You spent Rp 1.240.000 on [Food](#cat:food) in October, 12 percent less than September. The largest was [Warung Tekko](#txn:a).',
			at: '09:14',
			who: 'Assistant',
			toolCalls: [
				{ id: 't1', name: 'get_spending_summary', args: {}, status: 'ok', summary: '6 categories' }
			],
			files: []
		}
	];

	/** Four finished calls, which is what collapses behind "Used 4 tools". */
	const chatToolBatch: ToolCall[] = [
		{ id: 't2', name: 'get_workspace_context', args: {}, status: 'ok', summary: '3 wallets' },
		{ id: 't3', name: 'search_transactions', args: {}, status: 'ok', summary: '12 matches' },
		{ id: 't4', name: 'create_transaction', args: {}, status: 'ok', summary: 'Created expense 50,000 in Cash.' },
		{ id: 't5', name: 'delete_transaction', args: {}, status: 'failed', summary: 'Needs confirming.' }
	];

	const wallets: NamedOption[] = [
		{ id: 'cash', name: 'Cash' },
		{ id: 'bca', name: 'BCA' },
		{ id: 'wise', name: 'Wise' }
	];

	const rows: TransactionRow[] = [
		{ id: 'a', day: '2026-11-02', date: '02/11/2026', name: 'Warung Tekko', categoryId: 'food', walletId: 'cash', amount: '-87500', currency: 'IDR', note: 'Lunch with the team. Receipt attached.' },
		{ id: 'b', day: '2026-11-02', date: '02/11/2026', name: 'Gojek', categoryId: 'transport', walletId: 'cash', amount: '-24000', currency: 'IDR', note: 'Ride to the office.' },
		{ id: 'c', day: '2026-11-01', date: '01/11/2026', name: 'Salary', categoryId: 'salary', walletId: 'bca', amount: '9500000', currency: 'IDR', note: 'Monthly salary.' },
		{ id: 'd', day: '2026-11-01', date: '01/11/2026', name: 'Figma', categoryId: 'shopping', walletId: 'wise', amount: '-49.99', currency: 'USD', originalAmount: '-49.99', originalCurrency: 'USD', note: 'Entered in USD, converted at 16.250.' },
		{ id: 'e', day: '2026-10-28', date: '28/10/2026', name: 'Electricity', categoryId: 'bills', walletId: 'bca', amount: '-412000', currency: 'IDR', note: 'October bill.' }
	];
</script>

<section class="space-y-4">
	{@render heading('Transactions table', 'The advanced filter with its date range, grouping by day with that day’s totals, sortable columns, column visibility, selection with a bulk bar, a row that expands on click or chevron, the in-cell category editor, a row-actions menu and a footer count. It is always as wide as what holds it: the last ordinary column takes the remainder, and a drag on any other stops at that column’s ceiling, so one column cannot push the rest off screen.')}
	<TransactionsTable {rows} {categories} {wallets} />
</section>

<section class="space-y-4">
	{@render heading('Empty', 'The same table with every row filtered out.')}
	<TransactionsTable rows={[]} {categories} {wallets} />
</section>

<section class="space-y-4">
	{@render heading('Chat history', 'The conversation list: newest activity first, the open one marked, and a menu per row for renaming and deleting. Rename opens a dialog, delete asks first (UI-4).')}
	<div class="max-w-sm border p-3">
		<ChatHistory
			sessions={chatSessions}
			activeId="s1"
			onNew={() => {}}
			onRename={() => {}}
			onDelete={() => {}}
		/>
	</div>
</section>

<section class="space-y-4">
	{@render heading('Chat messages', 'A stored conversation: the tools the assistant used above what it said, Markdown below it, entity links as buttons that open a sheet or a filter, and copy and ask-again underneath.')}
	<div class="border p-4">
		<ChatMessages messages={chatMessages} onEntity={() => {}} onCopy={() => {}} />
	</div>
</section>

<section class="space-y-4">
	{@render heading('Chat tool calls', 'Progress, never JSON. One finished call is a check and its label; several collapse to a count and expand; the call in flight shimmers.')}
	<div class="flex flex-col gap-3 border p-4">
		<ToolCallGroup calls={[{ id: 't1', name: 'create_transaction', args: {}, status: 'ok', summary: 'Created expense 50,000 in Cash.' }]} />
		<ToolCallGroup calls={chatToolBatch} />
		<ToolCallGroup calls={[{ id: 't9', name: 'get_spending_summary', args: {}, status: 'running', summary: null }]} />
	</div>
</section>

<section class="space-y-4">
	{@render heading('Chat messages, empty', 'A conversation with nothing in it yet, and the three suggestions that start one.')}
	<div class="h-64 border p-4">
		<ChatMessages messages={[]} onEntity={() => {}} onCopy={() => {}}>
			{#snippet emptyActions()}
				<ChatSuggestions onSelect={() => {}} />
			{/snippet}
		</ChatMessages>
	</div>
</section>
