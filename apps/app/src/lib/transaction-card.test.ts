import { describe, expect, it } from 'vitest';

import {
	closingTotal,
	readTransactionCard,
	receiptCard,
	type TransactionCard
} from './transaction-card';

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
	items: [
		{
			id: 'item1',
			name: 'Noodles',
			brand: null,
			quantity: '2',
			unit: 'pcs',
			unit_price: '25000.0000',
			amount: '50000.0000',
			amount_formatted: 'Rp 50.000',
			category_id: 'cat2',
			category_name: 'Snacks',
			notes: null
		}
	],
	month_total_formatted: 'Rp 1.250.000',
	attachment_ids: ['file1'],
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

	it('treats missing attachments as none', () => {
		const { attachment_ids: _, ...noFiles } = payload;
		expect(readTransactionCard('transaction', noFiles)?.attachment_ids).toEqual([]);
	});
});

describe('receiptCard', () => {
	const card = (transaction_id: string, attachment_ids: string[], deleted = false) =>
		({ ...payload, transaction_id, attachment_ids, deleted }) as TransactionCard;

	it('finds the newest live card carrying the receipt', () => {
		const cards = [card('txn1', ['file1']), card('txn2', ['file2']), card('txn3', ['file1'])];
		expect(receiptCard(cards, 'file1')?.transaction_id).toBe('txn3');
		expect(receiptCard(cards, 'file2')?.transaction_id).toBe('txn2');
	});

	it('finds nothing for an unconfirmed or deleted receipt', () => {
		expect(receiptCard([card('txn1', ['file1'])], 'file9')).toBeNull();
		expect(receiptCard([card('txn1', ['file1'], true)], 'file1')).toBeNull();
		expect(receiptCard([], 'file1')).toBeNull();
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
