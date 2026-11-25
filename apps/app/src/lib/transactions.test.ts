import { describe, expect, it } from 'vitest';

import type { Transaction } from '$lib/server/ledger';

import { toRow } from './transactions';

const transaction = {
	id: 't1',
	wallet_id: 'w1',
	wallet_currency_code: 'IDR',
	category_id: 'c1',
	amount: '500000.0000',
	original_amount: null,
	original_currency_code: null,
	base_rate_is_stale: false,
	date: '2026-11-02T05:00:00Z',
	type: 'expense',
	name: 'Superindo',
	description: null
} as Transaction;

describe('toRow', () => {
	it('carries nothing extra for a row with no item categories and no filter', () => {
		const row = toRow({ ...transaction, other_category_count: 0, matched_amount: null });
		expect(row.otherCategoryCount).toBeUndefined();
		expect(row.matchedAmount).toBeUndefined();
	});

	it('carries the count of other categories (TXN-26)', () => {
		expect(toRow({ ...transaction, other_category_count: 2 }).otherCategoryCount).toBe(2);
	});

	it('signs the matched portion as the amount, and keeps it a string (TXN-25, D12)', () => {
		const row = toRow({ ...transaction, matched_amount: '40000.0000' });
		expect(row.amount).toBe('-500000.0000');
		expect(row.matchedAmount).toBe('-40000.0000');
		expect(
			toRow({ ...transaction, type: 'income', matched_amount: '40000.0000' }).matchedAmount
		).toBe('40000.0000');
	});
});
