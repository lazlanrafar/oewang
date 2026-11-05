import { describe, expect, it } from 'vitest';

import { groupKey, groupLabel } from './transactions-data-table-grouping';

describe('which block a day belongs to', () => {
	it('is the day itself when grouping daily', () => {
		expect(groupKey('2026-11-03', 'daily')).toBe('2026-11-03');
	});

	it('is the Monday on or before the day when grouping weekly', () => {
		// 3 November 2026 is a Tuesday, so its week starts on the 2nd.
		expect(groupKey('2026-11-03', 'weekly')).toBe('2026-11-02');
		expect(groupKey('2026-11-02', 'weekly')).toBe('2026-11-02');
		// A Sunday belongs to the week that began six days earlier, which is
		// the case `getDay()` returning 0 gets wrong.
		expect(groupKey('2026-11-08', 'weekly')).toBe('2026-11-02');
	});

	it('crosses a month and a year without losing the week', () => {
		expect(groupKey('2027-01-01', 'weekly')).toBe('2026-12-28');
	});

	it('is the year and month when grouping monthly', () => {
		expect(groupKey('2026-11-03', 'monthly')).toBe('2026-11');
	});

	it('is nothing at all when not grouping', () => {
		expect(groupKey('2026-11-03', 'none')).toBe('');
	});
});

describe('what the block header says', () => {
	it('names the weekday when grouping daily', () => {
		expect(groupLabel('2026-11-03', 'daily')).toBe('TUESDAY, 3 NOV 2026');
	});

	it('spans the week when grouping weekly', () => {
		expect(groupLabel('2026-11-02', 'weekly')).toBe('02 NOV - 08 NOV 2026');
	});

	it('names the month when grouping monthly', () => {
		expect(groupLabel('2026-11', 'monthly')).toBe('NOVEMBER 2026');
	});

	it('says nothing for an empty key', () => {
		expect(groupLabel('', 'none')).toBe('');
	});
});
