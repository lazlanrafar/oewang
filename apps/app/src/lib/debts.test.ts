import { describe, expect, it } from 'vitest';

import { crossRate, localToday, paidPercent, remainingByCurrency } from './debts';

const debt = (overrides: Partial<Parameters<typeof remainingByCurrency>[0][number] & { amount: string; paid_amount: string }> = {}) => ({
	type: 'receivable' as const,
	currency_code: 'IDR',
	amount: '100000.0000',
	remaining_amount: '40000.0000',
	paid_amount: '60000.0000',
	...overrides
});

describe('DEBT-11 the reader’s own date, which the page sends as today', () => {
	it('should read today from the local calendar, not UTC', () => {
		expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});
});

describe('DEBT-11 the paid share draws a bar from the API’s figures', () => {
	it('should give the paid share of the amount', () => {
		expect(paidPercent(debt())).toBe(60);
	});

	it('should draw nothing for a zero amount', () => {
		expect(paidPercent(debt({ amount: '0.0000', paid_amount: '0.0000' }))).toBe(0);
	});
});

describe('CON-2 a contact’s totals never add two currencies', () => {
	it('should total each currency on its own', () => {
		const rows = [
			debt(),
			debt({ remaining_amount: '10000.0000' }),
			debt({ currency_code: 'USD', remaining_amount: '5.5000' }),
			debt({ type: 'payable', remaining_amount: '7000.0000' })
		];
		expect(remainingByCurrency(rows, 'receivable')).toEqual([
			{ currency: 'IDR', total: '50000.0000' },
			{ currency: 'USD', total: '5.5000' }
		]);
		expect(remainingByCurrency(rows, 'payable')).toEqual([{ currency: 'IDR', total: '7000.0000' }]);
		expect(remainingByCurrency(rows)).toEqual([
			{ currency: 'IDR', total: '57000.0000' },
			{ currency: 'USD', total: '5.5000' }
		]);
	});
});

describe('DEBT-11 the payment rate prefill', () => {
	const rates = new Map([
		['USD', '16250.00000000'],
		['SGD', '12500.00000000']
	]);

	it('should be one for the same currency', () => {
		expect(crossRate(rates, 'IDR', 'USD', 'USD')).toBe('1');
	});

	it('should read a foreign currency into the workspace currency directly', () => {
		expect(crossRate(rates, 'IDR', 'USD', 'IDR')).toBe('16250');
	});

	it('should cross two foreign currencies through the workspace currency', () => {
		expect(crossRate(rates, 'IDR', 'USD', 'SGD')).toBe('1.3');
	});

	it('should give nothing when a rate is missing', () => {
		expect(crossRate(rates, 'IDR', 'EUR', 'IDR')).toBeNull();
	});
});
