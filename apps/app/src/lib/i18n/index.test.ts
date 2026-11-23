import { describe, expect, it } from 'vitest';

import { t } from './index';

describe('t plurals', () => {
	it('picks the singular for one and the plural otherwise', () => {
		expect(t('vault.storage.files', { count: 1 })).toBe('1 file');
		expect(t('vault.storage.files', { count: 0 })).toBe('0 files');
		expect(t('vault.storage.files', { count: 2 })).toBe('2 files');
	});

	it('counts a formatted number by its digits', () => {
		expect(t('settings.usage_storage_detail', { count: '1,234' })).toBe('1,234 files in the vault');
		expect(t('settings.usage_storage_detail', { count: '1' })).toBe('1 file in the vault');
	});

	it('pluralises each count by its own value', () => {
		expect(t('settings.currency_convert_done', { to: 'USD', count: 1, budgets: 3 })).toBe(
			'Converted to USD. 1 transaction and 3 budgets recalculated.'
		);
	});
});
