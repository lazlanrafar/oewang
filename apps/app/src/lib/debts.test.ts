import { describe, expect, it } from 'vitest';

import {
	crossRate,
	isOverdue,
	isPartlyPaid,
	localToday,
	paidAmount,
	paidPercent,
	remainingByCurrency
} from './debts';

const debt = (overrides: Partial<Parameters<typeof remainingByCurrency>[0][number]> = {}) => ({
	type: 'receivable' as const,
	status: 'partial' as const,
	currency_code: 'IDR',
	amount: '100000.0000',
	remaining_amount: '40000.0000',
	due_date: '2026-11-20',
	...overrides
});

describe('DEBT-11 overdue against the reader’s own date', () => {
	it('should be overdue when the due date is before today and the debt is open', () => {
		expect(isOverdue(debt(), '2026-11-24')).toBe(true);
	});

	it('should not be overdue on the due date itself', () => {
		expect(isOverdue(debt(), '2026-11-20')).toBe(false);
	});

	it('should not be overdue when paid or without a due date', () => {
		expect(isOverdue(debt({ status: 'paid' }), '2026-12-01')).toBe(false);
		expect(isOverdue(debt({ due_date: null }), '2026-12-01')).toBe(false);
	});

	it('should read today from the local calendar', () => {
		expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
	});
});

describe('DEBT-11 paid amounts stay decimal strings', () => {
	it('should subtract the remainder from the amount exactly', () => {
		expect(paidAmount(debt())).toBe('60000.0000');
		expect(paidAmount(debt({ amount: '0.3000', remaining_amount: '0.1000' }))).toBe('0.2000');
	});

	it('should know a partly paid debt from an unpaid or a settled one', () => {
		expect(isPartlyPaid(debt())).toBe(true);
		expect(isPartlyPaid(debt({ remaining_amount: '100000.0000' }))).toBe(false);
		expect(isPartlyPaid(debt({ remaining_amount: '0.0000' }))).toBe(false);
	});

	it('should give the paid share for a bar width', () => {
		expect(paidPercent(debt())).toBe(60);
		expect(paidPercent(debt({ amount: '0.0000', remaining_amount: '0.0000' }))).toBe(0);
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
