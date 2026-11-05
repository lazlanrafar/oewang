/**
 * Keeping the rest of the app fresh after a chat write (D32, CHAT-12).
 *
 * There is no realtime channel in this product and there will not be one
 * ([non-goals](../../../docs/prd.md#non-goals-for-v1)), so a transaction
 * the assistant creates leaves every view derived from it stale. This map
 * is the whole fix: a tool name to the data its write invalidates,
 * deduplicated by tool call id so one write does not fire once per token
 * that follows it.
 *
 * A write invalidates its whole derived surface, not only the table that
 * changed. A new transaction moves a wallet balance and every total
 * computed from it, and a user who switches tabs to a stale balance has
 * stopped trusting the number, which is the product.
 */

import type { ToolCall } from '$lib/chat-tools';

/**
 * What a load can depend on.
 *
 * A load registers one of these with SvelteKit's `depends()`, and
 * `invalidate()` with the same string reruns it. They are names rather
 * than URLs because the same rows reach several screens through different
 * requests, and a chat write is about the rows.
 */
export const INVALIDATION_KEYS = {
	transactions: 'app:transactions',
	transactionDetail: 'app:transaction-detail',
	transactionFilters: 'app:transaction-filters',
	summary: 'app:summary',
	wallets: 'app:wallets',
	walletBalances: 'app:wallet-balances',
	categories: 'app:categories',
	overview: 'app:overview',
	/** The Apps page's link status, which the connect dialog polls (D85). */
	integrations: 'app:integrations'
} as const;

export type InvalidationKey = (typeof INVALIDATION_KEYS)[keyof typeof INVALIDATION_KEYS];

/** A transaction write moves money, so everything counted from it goes. */
const TRANSACTION_WRITE: readonly InvalidationKey[] = [
	INVALIDATION_KEYS.transactions,
	INVALIDATION_KEYS.transactionDetail,
	INVALIDATION_KEYS.summary,
	INVALIDATION_KEYS.walletBalances,
	INVALIDATION_KEYS.overview
];

const TOOL_INVALIDATIONS: Record<string, readonly InvalidationKey[]> = {
	create_transaction: TRANSACTION_WRITE,
	update_transaction: TRANSACTION_WRITE,
	delete_transaction: TRANSACTION_WRITE,
	add_transaction_items: TRANSACTION_WRITE,
	create_wallet: [
		INVALIDATION_KEYS.wallets,
		INVALIDATION_KEYS.walletBalances,
		INVALIDATION_KEYS.transactionFilters
	],
	create_category: [
		INVALIDATION_KEYS.categories,
		INVALIDATION_KEYS.transactionFilters,
		INVALIDATION_KEYS.summary
	]
};

/** What one tool's successful call makes stale. Empty for a read tool. */
export function invalidationsForTool(name: string): readonly InvalidationKey[] {
	return TOOL_INVALIDATIONS[name] ?? [];
}

/**
 * The keys to invalidate for a turn's tool calls, each call counted once.
 *
 * `handled` is the set of tool call ids already acted on, and it is added
 * to rather than replaced: the turn's call list grows with every event, so
 * this runs repeatedly over a list that keeps its earlier entries.
 *
 * Only a call that answered `ok` invalidates anything. A refused write, a
 * failed one and a `CONFIRMATION_REQUIRED` all changed nothing, and
 * refetching the ledger because the model was told no is a request that
 * buys nothing.
 */
export function collectInvalidations(
	calls: readonly ToolCall[],
	handled: Set<string>
): InvalidationKey[] {
	const keys = new Set<InvalidationKey>();

	for (const call of calls) {
		if (call.status !== 'ok') continue;
		if (handled.has(call.id)) continue;

		handled.add(call.id);
		for (const key of invalidationsForTool(call.name)) keys.add(key);
	}

	return [...keys];
}

/**
 * Collect, then invalidate, once per batch.
 *
 * The caller passes SvelteKit's `invalidate`, which keeps this module free
 * of the router and lets the deduplication be tested by counting calls.
 */
export async function invalidateForToolCalls(
	calls: readonly ToolCall[],
	handled: Set<string>,
	invalidate: (key: string) => Promise<void> | void
): Promise<InvalidationKey[]> {
	const keys = collectInvalidations(calls, handled);
	for (const key of keys) await invalidate(key);
	return keys;
}
