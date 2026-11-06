import { describe, expect, it } from 'vitest';

import { categoryColorClass, colorStyle, isHexColor } from './colors';

describe('colorStyle', () => {
	it('should override only the colours that are set', () => {
		expect(colorStyle({ income_color: '#10bc99', expense_color: null })).toBe(
			'--color-green: #10bc99'
		);
		expect(colorStyle({ income_color: null, expense_color: null })).toBe('');
	});

	it('should never write a value that is not six hex digits', () => {
		expect(
			colorStyle({ income_color: 'red; background: url(x)', expense_color: '#ef4444' })
		).toBe('--color-red: #ef4444');
		expect(isHexColor('#10bc9')).toBe(false);
		expect(isHexColor('#10BC99')).toBe(true);
	});
});

describe('categoryColorClass', () => {
	it('should colour a category by its type', () => {
		expect(categoryColorClass('income')).toBe('bg-green');
		expect(categoryColorClass('expense')).toBe('bg-red');
		expect(categoryColorClass(undefined)).toBe('bg-subtle');
	});
});
