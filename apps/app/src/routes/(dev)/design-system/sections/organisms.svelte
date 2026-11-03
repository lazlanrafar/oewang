<script lang="ts">
	/**
	 * Whole features, built from molecules and atoms.
	 *
	 * The rows here are mock, and the table takes them as a prop: the
	 * component itself holds no data and fetches nothing, which is what lets
	 * it be shown on a page with no server behind it.
	 */
	import type { MessageItem, SessionItem } from '$lib/chat';
	import { ChatHistory, ChatMessages } from '$lib/components/organisms/chat';
	import { TransactionsTable } from '$lib/components/organisms/data-table';
	import type { NamedOption, TransactionRow } from '$lib/components/organisms/data-table';

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
		{ id: 'm1', role: 'user', content: 'How much did I spend on food last month?', at: '09:14', who: 'You' },
		{ id: 'm2', role: 'assistant', content: 'You spent Rp 1.240.000 on Food in October, 12 percent less than September.', at: '09:14', who: 'Assistant' }
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
	{@render heading('Transactions table', 'The advanced filter with its date range, grouping by day with that day’s totals, sortable columns, column visibility, selection with a bulk bar, a row that expands on click or chevron, the in-cell category editor, a row-actions menu and a footer count.')}
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
	{@render heading('Chat messages', 'A stored conversation. Markdown, tool cards and the message actions arrive with the stream; this is what a conversation reads like once it is saved.')}
	<div class="border p-4">
		<ChatMessages messages={chatMessages} />
	</div>
</section>

<section class="space-y-4">
	{@render heading('Chat messages, empty', 'A conversation with nothing in it yet.')}
	<div class="h-64 border p-4">
		<ChatMessages messages={[]} />
	</div>
</section>
