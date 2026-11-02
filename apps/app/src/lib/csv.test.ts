import { describe, expect, it } from 'vitest';

import { detectDelimiter, parseDelimited } from './csv';

describe('parseDelimited', () => {
	it('should read a plain CSV', () => {
		const file = parseDelimited('Date,Name,Amount\n2026-11-02,Lunch,50000\n');
		expect(file.columns).toEqual(['Date', 'Name', 'Amount']);
		expect(file.rows).toEqual([{ Date: '2026-11-02', Name: 'Lunch', Amount: '50000' }]);
	});

	it('should keep a delimiter that sits inside quotes', () => {
		const file = parseDelimited('Name,Amount\n"Lunch, with the team",50000\n');
		expect(file.rows[0].Name).toBe('Lunch, with the team');
		expect(file.rows[0].Amount).toBe('50000');
	});

	it('should read a doubled quote as one quote', () => {
		const file = parseDelimited('Name\n"He said ""hello"""\n');
		expect(file.rows[0].Name).toBe('He said "hello"');
	});

	it('should keep a newline that sits inside quotes', () => {
		const file = parseDelimited('Name,Amount\n"Two\nlines",50000\n');
		expect(file.rows).toHaveLength(1);
		expect(file.rows[0].Name).toBe('Two\nlines');
	});

	it('should find the delimiter a bank used', () => {
		expect(detectDelimiter('Tanggal;Keterangan;Debet')).toBe(';');
		expect(detectDelimiter('Date\tName\tAmount')).toBe('\t');
		expect(detectDelimiter('Date,Name,Amount')).toBe(',');
	});

	it('should strip the byte order mark Excel writes', () => {
		// Otherwise the first column's name can never be matched.
		const file = parseDelimited('﻿Date,Amount\n2026-11-02,1\n');
		expect(file.columns[0]).toBe('Date');
	});

	it('should name an unnamed column so the mapping can address it', () => {
		const file = parseDelimited('Date,,Amount\n2026-11-02,x,1\n');
		expect(file.columns).toEqual(['Date', 'Column 2', 'Amount']);
	});

	it('should pad a short row and drop a row with too many fields', () => {
		const file = parseDelimited('Date,Name,Amount\n2026-11-02,Lunch\n1,2,3,4\n');
		expect(file.rows).toEqual([{ Date: '2026-11-02', Name: 'Lunch', Amount: '' }]);
		expect(file.dropped).toBe(1);
	});

	it('should answer with nothing for an empty file', () => {
		expect(parseDelimited('')).toEqual({ columns: [], rows: [], dropped: 0 });
	});
});
