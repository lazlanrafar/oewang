import { describe, expect, it } from 'vitest';

import {
	addDecimals,
	currencyDigits,
	formatMoney,
	isNegative,
	isZero,
	multiplyDecimals,
	negate,
	roundDecimal,
	signedAmount
} from './money';

describe('currencyDigits', () => {
	it('should know that rupiah has no decimal places and dollars have two', () => {
		expect(currencyDigits('IDR')).toBe(0);
		expect(currencyDigits('USD')).toBe(2);
		expect(currencyDigits('JPY')).toBe(0);
	});

	it('should fall back to two places for a code it does not know', () => {
		expect(currencyDigits('ZZZ')).toBe(2);
		// Normalized before it is looked up.
		expect(currencyDigits(' idr ')).toBe(0);
	});
});

describe('roundDecimal', () => {
	it('should round half away from zero, as the API does', () => {
		expect(roundDecimal('0.5', 0)).toBe('1');
		expect(roundDecimal('1.5', 0)).toBe('2');
		expect(roundDecimal('-0.5', 0)).toBe('-1');
		expect(roundDecimal('2.345', 2)).toBe('2.35');
	});

	it('should carry into the whole part', () => {
		expect(roundDecimal('9.99', 1)).toBe('10.0');
		expect(roundDecimal('999.95', 1)).toBe('1000.0');
	});

	it('should pad rather than truncate when there is nothing to round', () => {
		expect(roundDecimal('5', 2)).toBe('5.00');
		expect(roundDecimal('5.1', 2)).toBe('5.10');
	});

	it('should survive a figure no double could hold', () => {
		// 2^53 is where a JavaScript number starts losing integers. The whole
		// point of keeping money as a string is that this still works.
		expect(roundDecimal('9007199254740993.0000', 0)).toBe('9007199254740993');
	});
});

describe('formatMoney', () => {
	it('should render rupiah with no decimal places', () => {
		expect(formatMoney('812500.0000', 'IDR')).toBe('Rp 812.500');
		expect(formatMoney('-87500.0000', 'IDR')).toBe('-Rp 87.500');
	});

	it('should render dollars with cents', () => {
		expect(formatMoney('49.9900', 'USD')).toBe('$ 49,99');
		expect(formatMoney('1234.5000', 'USD')).toBe('$ 1.234,50');
	});

	it('should mark a positive figure when asked, so colour is never alone', () => {
		expect(formatMoney('50000', 'IDR', { signed: true })).toBe('+Rp 50.000');
		expect(formatMoney('-50000', 'IDR', { signed: true })).toBe('-Rp 50.000');
	});

	it('should drop the symbol when the column already carries it', () => {
		expect(formatMoney('50000', 'IDR', { withSymbol: false })).toBe('50.000');
	});
});

describe('addDecimals', () => {
	it('should add exactly', () => {
		expect(addDecimals(['0.1', '0.2'], 4)).toBe('0.3000');
		expect(addDecimals(['50000.0000', '-87500.0000'])).toBe('-37500.0000');
		expect(addDecimals([])).toBe('0.0000');
	});

	it('should not lose a cent across a long column', () => {
		const hundred = Array.from({ length: 100 }, () => '0.01');
		expect(addDecimals(hundred, 2)).toBe('1.00');
	});
});

describe('multiplyDecimals', () => {
	it('should convert a balance into another currency exactly', () => {
		// USD 50 at 16,250 is the worked example from the data model.
		expect(multiplyDecimals('50.0000', '16250.00000000', 4)).toBe('812500.0000');
	});

	it('should keep the sign', () => {
		expect(multiplyDecimals('-50', '16250', 0)).toBe('-812500');
	});

	it('should round the product, not the inputs', () => {
		// 0.15 x 0.5 is 0.075, and half rounds away from zero.
		expect(multiplyDecimals('0.15', '0.5', 2)).toBe('0.08');
		expect(multiplyDecimals('0.15', '0.15', 2)).toBe('0.02');
	});
});

describe('signs', () => {
	it('should read an expense as negative and an income as positive', () => {
		expect(signedAmount('expense', '50000')).toBe('-50000');
		expect(signedAmount('income', '50000')).toBe('50000');
		expect(signedAmount('transfer', '50000')).toBe('-50000');
	});

	it('should recognise zero however it is written', () => {
		expect(isZero('0')).toBe(true);
		expect(isZero('0.0000')).toBe(true);
		expect(isZero('-0.00')).toBe(true);
		expect(isZero('0.0001')).toBe(false);
	});

	it('should not call negative zero negative', () => {
		expect(isNegative('-0.0000')).toBe(false);
		expect(isNegative('-1')).toBe(true);
		expect(negate('-50')).toBe('50');
		expect(negate('0')).toBe('0');
	});
});
