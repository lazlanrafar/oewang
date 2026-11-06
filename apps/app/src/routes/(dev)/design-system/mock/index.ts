/**
 * The specimens' data, as JSON.
 *
 * Nothing on this page is real: no workspace, no person, no balance. A
 * specimen that borrows production data puts a real name and a real figure
 * on a page whose whole purpose is to be shared around, and it also hides
 * the empty, long and awkward cases that a hand-written fixture can state
 * outright.
 *
 * The files are plain JSON so the shape is visible at a glance and nothing
 * here can quietly acquire logic. The casts are the only code: JSON has no
 * literal types, so each file is read back as the type the component it
 * feeds expects, and a fixture that drifts from that type is a typecheck
 * error rather than a broken specimen.
 */
import type { ColumnSpec, NamedOption, RowGroup } from '$lib/components/molecules/data-table';
import type { MessageItem, SessionItem } from '$lib/chat';
import type { ToolCall } from '$lib/chat-tools';
import type { BudgetStatus } from '$lib/reports';
import type { TransactionRow } from '$lib/components/organisms/transactions';
import type { Wallet } from '$lib/server/ledger';

import accountsJson from './accounts.json';
import budgetsJson from './budgets.json';
import chatJson from './chat.json';
import dataTableJson from './data-table.json';
import transactionsJson from './transactions.json';
import workspaceJson from './workspace.json';

export const workspace = workspaceJson;

/** A row in the generic table specimen: anything with an id, as the shell says. */
export type SampleRow = {
	id: string;
	date: string;
	name: string;
	amount: string;
	negative: boolean;
	tagId: string;
};

export const sampleColumns = dataTableJson.columns as ColumnSpec[];
export const sampleTags = dataTableJson.tags;
export const sampleLabel = dataTableJson.label;
export const sampleGroups = dataTableJson.groups as Array<RowGroup<SampleRow> & { label: string }>;
export const sampleRows: SampleRow[] = sampleGroups.flatMap((group) => group.rows);

export const categories = transactionsJson.categories as NamedOption[];
export const wallets = transactionsJson.wallets as NamedOption[];
export const transactionRows = transactionsJson.rows as TransactionRow[];

export const accountGroups = accountsJson.groups;
export const accounts = accountsJson.accounts as Wallet[];
export const accountRates: Record<string, string> = accountsJson.rates;
export const accountSummary = accountsJson.summary;
export const baseCurrency = accountsJson.baseCurrency;

export const chatSessions = chatJson.sessions as SessionItem[];
export const chatMessages = chatJson.messages as MessageItem[];
export const chatToolBatch = chatJson.toolBatch as ToolCall[];

export const budgetStatus = budgetsJson.status as BudgetStatus;
