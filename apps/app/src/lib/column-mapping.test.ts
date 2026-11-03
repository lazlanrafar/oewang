import { describe, expect, it } from 'vitest';

import { cleanMapping, isMappable } from './column-mapping';

const columns = ['Date', 'Description', 'Debit', 'Credit', 'Category'];

describe('cleanMapping', () => {
	it('keeps the fields the file can support', () => {
		expect(
			cleanMapping(
				{ date: 'Date', name: 'Description', amount_out: 'Debit', amount_in: 'Credit' },
				columns
			)
		).toEqual({
			date: 'Date',
			name: 'Description',
			amount_out: 'Debit',
			amount_in: 'Credit'
		});
	});

	it('drops a column the file does not have', () => {
		// The model is answering about a file it never saw a row of, so a
		// column it invented must not reach the step.
		expect(cleanMapping({ date: 'Date', amount: 'Jumlah' }, columns)).toEqual({ date: 'Date' });
	});

	it('matches a column without regard to case, and keeps the file spelling', () => {
		// The rows are stored under the file's own key, so that is what
		// comes back even when the proposal lowercased it.
		expect(cleanMapping({ date: 'date', name: 'DESCRIPTION' }, columns)).toEqual({
			date: 'Date',
			name: 'Description'
		});
	});

	it('gives a column claimed twice to its first field', () => {
		// One column cannot be both the date and the amount.
		expect(cleanMapping({ date: 'Date', amount: 'Date' }, columns)).toEqual({ date: 'Date' });
	});

	it('drops a field this wizard does not have', () => {
		expect(cleanMapping({ date: 'Date', balance: 'Credit' }, columns)).toEqual({ date: 'Date' });
	});

	it('drops a value that is not a column name', () => {
		expect(cleanMapping({ date: 3, name: null, amount: ['Debit'] }, columns)).toEqual({});
	});

	it('answers empty for a body that is not an object', () => {
		// A failed or empty mapping call leaves the step empty, which is the
		// documented fallback: the user maps by hand (AI-9).
		expect(cleanMapping(null, columns)).toEqual({});
		expect(cleanMapping('Date', columns)).toEqual({});
		expect(cleanMapping(['Date'], columns)).toEqual({});
		expect(cleanMapping({}, columns)).toEqual({});
	});

	it('answers empty for a file with no columns', () => {
		expect(cleanMapping({ date: 'Date' }, [])).toEqual({});
	});
});

describe('isMappable', () => {
	it('needs a date and a figure', () => {
		expect(isMappable({ date: 'Date', amount: 'Debit' })).toBe(true);
		expect(isMappable({ date: 'Date', amount_out: 'Debit' })).toBe(true);
		expect(isMappable({ date: 'Date', amount_in: 'Credit' })).toBe(true);
	});

	it('refuses a mapping missing either half', () => {
		expect(isMappable({ date: 'Date' })).toBe(false);
		expect(isMappable({ amount: 'Debit' })).toBe(false);
		expect(isMappable({})).toBe(false);
	});
});
