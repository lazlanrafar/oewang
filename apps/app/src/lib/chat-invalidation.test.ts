import { describe, expect, it } from 'vitest';

import {
	collectInvalidations,
	INVALIDATION_KEYS,
	invalidateForToolCalls,
	invalidationsForTool
} from './chat-invalidation';
import type { ToolCall } from './chat-tools';

function call(overrides: Partial<ToolCall> = {}): ToolCall {
	return { id: 't1', name: 'create_transaction', args: {}, status: 'ok', summary: null, ...overrides };
}

describe('invalidationsForTool', () => {
	it('invalidates the whole derived surface after a transaction write', () => {
		// A new transaction moves a wallet balance and every total computed
		// from it, so the table is not the only thing that went stale.
		for (const name of [
			'create_transaction',
			'update_transaction',
			'delete_transaction',
			'add_transaction_items'
		]) {
			expect(invalidationsForTool(name)).toEqual([
				INVALIDATION_KEYS.transactions,
				INVALIDATION_KEYS.transactionDetail,
				INVALIDATION_KEYS.summary,
				INVALIDATION_KEYS.walletBalances,
				INVALIDATION_KEYS.overview
			]);
		}
	});

	it('invalidates the lists and the filter options after a wallet write', () => {
		expect(invalidationsForTool('create_wallet')).toEqual([
			INVALIDATION_KEYS.wallets,
			INVALIDATION_KEYS.walletBalances,
			INVALIDATION_KEYS.transactionFilters
		]);
	});

	it('invalidates the lists, the filter options and the summary after a category write', () => {
		expect(invalidationsForTool('create_category')).toEqual([
			INVALIDATION_KEYS.categories,
			INVALIDATION_KEYS.transactionFilters,
			INVALIDATION_KEYS.summary
		]);
	});

	it('invalidates nothing for a read tool', () => {
		expect(invalidationsForTool('get_spending_summary')).toEqual([]);
		expect(invalidationsForTool('search_transactions')).toEqual([]);
		expect(invalidationsForTool('present_choices')).toEqual([]);
		expect(invalidationsForTool('something_new')).toEqual([]);
	});
});

describe('collectInvalidations', () => {
	it('counts each tool call once, however often the list is walked', () => {
		// The turn hands back the same call on every event that follows it.
		const handled = new Set<string>();
		const calls = [call()];

		expect(collectInvalidations(calls, handled)).toHaveLength(5);
		expect(collectInvalidations(calls, handled)).toEqual([]);
		expect(collectInvalidations([...calls, call({ id: 't2', name: 'create_category' })], handled))
			.toEqual([
				INVALIDATION_KEYS.categories,
				INVALIDATION_KEYS.transactionFilters,
				INVALIDATION_KEYS.summary
			]);
	});

	it('merges two writes into one set of keys', () => {
		const keys = collectInvalidations(
			[call({ id: 't1' }), call({ id: 't2', name: 'update_transaction' })],
			new Set()
		);

		expect(keys).toEqual([
			INVALIDATION_KEYS.transactions,
			INVALIDATION_KEYS.transactionDetail,
			INVALIDATION_KEYS.summary,
			INVALIDATION_KEYS.walletBalances,
			INVALIDATION_KEYS.overview
		]);
	});

	it('ignores a call that has not answered yet', () => {
		// Refetching before the write lands would fetch the old rows and
		// mark them fresh.
		expect(collectInvalidations([call({ status: 'running' })], new Set())).toEqual([]);
	});

	it('ignores a refused or failed call', () => {
		// A `TOOL_FORBIDDEN`, a cap and a `CONFIRMATION_REQUIRED` all
		// changed nothing.
		expect(collectInvalidations([call({ status: 'failed' })], new Set())).toEqual([]);
	});

	it('remembers a running call only once it succeeds', () => {
		const handled = new Set<string>();

		expect(collectInvalidations([call({ status: 'running' })], handled)).toEqual([]);
		expect(collectInvalidations([call({ status: 'ok' })], handled)).toHaveLength(5);
	});
});

describe('invalidateForToolCalls', () => {
	it('fires once per key and never twice for the same call', async () => {
		const fired: string[] = [];
		const handled = new Set<string>();
		const calls = [call(), call({ id: 't2', name: 'get_recent_transactions' })];

		await invalidateForToolCalls(calls, handled, (key) => {
			fired.push(key);
		});
		await invalidateForToolCalls(calls, handled, (key) => {
			fired.push(key);
		});

		expect(fired).toEqual([
			INVALIDATION_KEYS.transactions,
			INVALIDATION_KEYS.transactionDetail,
			INVALIDATION_KEYS.summary,
			INVALIDATION_KEYS.walletBalances,
			INVALIDATION_KEYS.overview
		]);
	});
});
