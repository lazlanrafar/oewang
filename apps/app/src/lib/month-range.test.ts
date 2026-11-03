import { describe, expect, it } from 'vitest';

import { currentMonth } from './month-range';

describe('the month a list opens on', () => {
	it('spans the whole month the day falls in', () => {
		expect(currentMonth(new Date(2026, 10, 3))).toEqual({
			start: '2026-11-01',
			end: '2026-11-30'
		});
	});

	it('reads the length of the month rather than assuming one', () => {
		expect(currentMonth(new Date(2026, 1, 14)).end).toBe('2026-02-28');
		expect(currentMonth(new Date(2024, 1, 14)).end).toBe('2024-02-29');
	});

	it('pads a single-digit month, because the API wants YYYY-MM-DD', () => {
		expect(currentMonth(new Date(2026, 0, 31))).toEqual({
			start: '2026-01-01',
			end: '2026-01-31'
		});
	});
});
