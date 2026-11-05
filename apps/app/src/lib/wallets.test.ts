import { describe, expect, it } from 'vitest';

import { groupWallets, inBaseCurrency, walletTotals, type WalletLike } from './wallets';

describe('groupWallets', () => {
	const wallet = (over: Partial<WalletLike> = {}): WalletLike => ({
		id: 'w',
		group_id: null,
		group_name: null,
		name: 'Cash',
		currency_code: 'IDR',
		balance: '1000.0000',
		is_included_in_totals: true,
		is_default: false,
		sort_order: 0,
		created_at: '2026-11-01T00:00:00Z',
		updated_at: '2026-11-01T00:00:00Z',
		...over
	});

	it('should render a group that has no wallets yet', () => {
		// Otherwise a group created before its first wallet is invisible and
		// cannot be edited or deleted.
		const grouped = groupWallets([], [{ id: 'g1', name: 'Banks' }], 'IDR', {});
		expect(grouped).toHaveLength(1);
		expect(grouped[0].name).toBe('Banks');
		expect(grouped[0].total).toBe('0.0000');
	});

	it('should total a group in the workspace currency', () => {
		const grouped = groupWallets(
			[
				wallet({ id: 'a', group_id: 'g1', balance: '1000.0000' }),
				wallet({ id: 'b', group_id: 'g1', currency_code: 'USD', balance: '50.0000' })
			],
			[{ id: 'g1', name: 'Banks' }],
			'IDR',
			{ USD: '16250.00000000' }
		);

		expect(grouped[0].total).toBe('813500.0000');
		expect(grouped[0].unconverted).toBe(0);
	});

	it('should leave a wallet out of the total when its rate is missing, and say so', () => {
		const grouped = groupWallets(
			[
				wallet({ id: 'a', group_id: 'g1', balance: '1000.0000' }),
				wallet({ id: 'b', group_id: 'g1', currency_code: 'USD', balance: '50.0000' })
			],
			[{ id: 'g1', name: 'Banks' }],
			'IDR',
			{}
		);

		expect(grouped[0].total).toBe('1000.0000');
		expect(grouped[0].unconverted).toBe(1);
	});

	it('should skip a wallet that does not count towards totals', () => {
		const grouped = groupWallets(
			[wallet({ group_id: 'g1', is_included_in_totals: false })],
			[{ id: 'g1', name: 'Banks' }],
			'IDR',
			{}
		);
		expect(grouped[0].total).toBe('0.0000');
	});

	it('should put ungrouped wallets last', () => {
		const grouped = groupWallets(
			[wallet({ id: 'a' }), wallet({ id: 'b', group_id: 'g1' })],
			[{ id: 'g1', name: 'Banks' }],
			'IDR',
			{}
		);
		expect(grouped.map((group) => group.id)).toEqual(['g1', null]);
	});
});

describe('inBaseCurrency', () => {
	it('should leave a balance alone when it is already the workspace currency', () => {
		expect(inBaseCurrency('1000.0000', 'IDR', 'IDR', {})).toBe('1000.0000');
	});

	it('should answer null when no rate exists for the pair', () => {
		expect(inBaseCurrency('50.0000', 'USD', 'IDR', {})).toBeNull();
	});
});

describe('the figures above the accounts table', () => {
	const base = 'IDR';

	const wallet = (over: Partial<WalletLike> = {}): WalletLike => ({
		id: 'w',
		group_id: null,
		group_name: null,
		name: 'Cash',
		currency_code: 'IDR',
		balance: '1000.0000',
		is_included_in_totals: true,
		is_default: false,
		sort_order: 0,
		created_at: '2026-11-01T00:00:00Z',
		updated_at: '2026-11-01T00:00:00Z',
		...over
	});

	it('totals only the wallets flagged to count', () => {
		const totals = walletTotals(
			[
				wallet({ id: 'a', balance: '100000' }),
				wallet({ id: 'b', balance: '50000', is_included_in_totals: false })
			],
			base,
			{}
		);

		expect(totals.total).toBe('100000.0000');
		expect(totals.count).toBe(2);
		expect(totals.counted).toBe(1);
	});

	it('converts a foreign wallet rather than adding it as if it were not', () => {
		const totals = walletTotals(
			[
				wallet({ id: 'a', balance: '100000' }),
				wallet({ id: 'b', balance: '10', currency_code: 'USD' })
			],
			base,
			{ USD: '16000' }
		);

		expect(totals.total).toBe('260000.0000');
		expect(totals.unconverted).toBe(0);
	});

	it('leaves a wallet out when no rate exists, and says how many', () => {
		const totals = walletTotals(
			[
				wallet({ id: 'a', balance: '100000' }),
				wallet({ id: 'b', balance: '10', currency_code: 'USD' })
			],
			base,
			{}
		);

		expect(totals.total).toBe('100000.0000');
		expect(totals.unconverted).toBe(1);
	});
});
