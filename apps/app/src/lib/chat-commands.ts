/**
 * The composer's "/" shortcuts, ported from the old app's
 * `packages/constants/src/chat-shortcuts.ts`.
 *
 * Fifteen of the old twenty-eight: the ones the current tools can answer.
 * The budget one came back with budgets (D103). The rest asked about
 * invoices, debts, contacts, a P&L or a runway, which are not in v1 (PRD
 * non-goals), or about uncategorized and
 * recurring rows, which no tool can filter for. A shortcut the assistant
 * cannot answer is a worse menu entry than no entry.
 *
 * Picking one sends its title as the user's message, as the old menu did.
 * The old `toolName` metadata is gone with it: the old transport dropped it
 * too, and the model reads the sentence.
 */

import { t, type TranslationKey } from '$lib/i18n';

export type ChatCommand = {
	command: '/show' | '/find' | '/analyze';
	title: TranslationKey;
	keywords: string[];
};

export const CHAT_COMMANDS: ChatCommand[] = [
	{ command: '/show', title: 'chat.command_latest_transactions', keywords: ['show', 'latest', 'transactions', 'recent'] },
	{ command: '/show', title: 'chat.command_spending_hotspots', keywords: ['show', 'burn', 'cash', 'spending', 'analysis'] },
	{ command: '/show', title: 'chat.command_spend_most_month', keywords: ['show', 'spending', 'most', 'this month', 'where', 'expense'] },
	{ command: '/analyze', title: 'chat.command_weekly_trends', keywords: ['analyze', 'weekly', 'trends', 'insights'] },
	{ command: '/show', title: 'chat.command_income_performance', keywords: ['show', 'revenue', 'performance', 'income'] },
	{ command: '/show', title: 'chat.command_expense_breakdown', keywords: ['show', 'expense', 'breakdown', 'category'] },
	{ command: '/analyze', title: 'chat.command_spending_patterns', keywords: ['analyze', 'spending', 'patterns', 'habits'] },
	{ command: '/show', title: 'chat.command_account_balances', keywords: ['show', 'account', 'balances', 'wallet'] },
	{ command: '/show', title: 'chat.command_cash_flow', keywords: ['show', 'cash', 'flow'] },
	{ command: '/show', title: 'chat.command_cash_flow_month', keywords: ['show', 'cash', 'flow', 'month', 'this month'] },
	{ command: '/analyze', title: 'chat.command_cash_flow_trends', keywords: ['analyze', 'cash', 'flow', 'trends', 'patterns'] },
	{ command: '/show', title: 'chat.command_expenses', keywords: ['show', 'expenses', 'costs', 'spending'] },
	{ command: '/show', title: 'chat.command_expenses_month', keywords: ['show', 'expenses', 'month', 'this month'] },
	{ command: '/analyze', title: 'chat.command_expense_trends', keywords: ['analyze', 'expense', 'trends', 'patterns'] },
	{ command: '/show', title: 'chat.command_budget', keywords: ['show', 'budget', 'actual', 'spending', 'limit'] }
];

/**
 * What follows the last "/" before the cursor, or `null` when there is no
 * slash there. The old rule exactly: any slash opens the menu, spaces and
 * all, and the menu closes once the cursor is before every slash.
 */
export function commandQuery(value: string, cursor: number): string | null {
	const before = value.slice(0, cursor);
	const slash = before.lastIndexOf('/');
	return slash === -1 ? null : before.slice(slash + 1);
}

/** The shortcuts matching a query by command, title or keyword. */
export function filterCommands(query: string, commands = CHAT_COMMANDS): ChatCommand[] {
	const needle = query.toLowerCase().trim();
	return commands.filter(
		(entry) =>
			entry.command.toLowerCase().includes(needle) ||
			t(entry.title).toLowerCase().includes(needle) ||
			entry.keywords.some((keyword) => keyword.toLowerCase().includes(needle))
	);
}
