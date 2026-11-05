import { describe, expect, it } from 'vitest';

import { pageTitle } from './page-title';

describe('pageTitle', () => {
	it('follows the old template, most specific part first', () => {
		expect(pageTitle('Transactions')).toBe('Transactions | Oewang');
		expect(pageTitle('Assistant', 'Settings')).toBe('Assistant | Settings | Oewang');
	});

	it('falls back to the default title', () => {
		expect(pageTitle()).toBe('Oewang - Financial OS');
		expect(pageTitle('  ')).toBe('Oewang - Financial OS');
	});
});
