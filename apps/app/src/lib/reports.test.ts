import { describe, expect, it } from 'vitest';

import { chartValue } from './money';
import { monthLabel, rangeLabel, shareLabel, spansYears } from './reports';

describe('report labels', () => {
	it('names a month from its parts, not through a UTC parse', () => {
		expect(monthLabel('2026-03')).toBe('Mar 2026');
		expect(monthLabel('2026-03', false)).toBe('Mar');
	});

	it('knows when a run of months needs its years', () => {
		expect(spansYears([{ month: '2025-12' }, { month: '2026-01' }])).toBe(true);
		expect(spansYears([{ month: '2026-01' }, { month: '2026-02' }])).toBe(false);
	});

	it('writes a range with the year once when both ends share it', () => {
		expect(rangeLabel('2026-11-01', '2026-11-30')).toBe('1 Nov to 30 Nov 2026');
		expect(rangeLabel('2025-12-01', '2026-11-30')).toBe('1 Dec 2025 to 30 Nov 2026');
	});

	it('names uncategorized rows and the rest bucket from the dictionary', () => {
		expect(shareLabel({ name: 'Food', other: false })).toBe('Food');
		expect(shareLabel({ name: null, other: false })).toBe('Uncategorized');
		expect(shareLabel({ name: null, other: true })).toBe('Other');
	});
});

describe('chartValue', () => {
	it('is a height, and a broken amount draws as nothing rather than NaN', () => {
		expect(chartValue('1250000.0000')).toBe(1250000);
		expect(chartValue('oops')).toBe(0);
	});
});
