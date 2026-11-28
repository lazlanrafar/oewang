import { describe, expect, it } from 'vitest';

import { closingTotal, readTransactionCard, type TransactionCard } from './transaction-card';

const payload = {
	transaction_id: 'txn1',
	type: 'expense',
	name: 'Lunch',
	amount_formatted: 'Rp 50.000',
	category_id: 'cat1',
	category_name: 'Food',
	wallet_id: 'w1',
	wallet_name: 'Cash',
	to_wallet_name: null,
	date: '2026-11-03',
	items: [{ name: 'Noodles', amount_formatted: 'Rp 50.000' }],
	month_total_formatted: 'Rp 1.250.000',
	deleted: false
};

describe('readTransactionCard', () => {
	it('reads the card the API sent', () => {
		expect(readTransactionCard('transaction', payload)).toEqual(payload);
	});

	it('refuses another kind and a card without a transaction', () => {
		expect(readTransactionCard('spending', payload)).toBeNull();
		expect(readTransactionCard('transaction', { ...payload, transaction_id: '' })).toBeNull();
		expect(readTransactionCard('transaction', null)).toBeNull();
		expect(readTransactionCard('transaction', [payload])).toBeNull();
	});

	it('treats missing items as none', () => {
		const { items: _, ...noItems } = payload;
		expect(readTransactionCard('transaction', noItems)?.items).toEqual([]);
	});
});

describe('closingTotal', () => {
	it('closes on the newest card the reply holds', () => {
		const first = { ...payload, month_total_formatted: 'Rp 50.000' } as TransactionCard;
		const second = { ...payload, month_total_formatted: 'Rp 80.000' } as TransactionCard;
		expect(closingTotal([first, second])).toBe('Rp 80.000');
		expect(closingTotal([])).toBeNull();
	});
});
