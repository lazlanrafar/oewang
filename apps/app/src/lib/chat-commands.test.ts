import { describe, expect, it } from 'vitest';

import { CHAT_COMMANDS, commandQuery, filterCommands } from './chat-commands';
import { t } from './i18n';

describe('commandQuery', () => {
	it('reads what follows the last slash before the cursor', () => {
		expect(commandQuery('/sho', 4)).toBe('sho');
		expect(commandQuery('hi /cash flow', 13)).toBe('cash flow');
		expect(commandQuery('/a /b', 5)).toBe('b');
	});

	it('is null with no slash before the cursor', () => {
		expect(commandQuery('hello', 5)).toBeNull();
		expect(commandQuery('ab/cd', 2)).toBeNull();
	});
});

describe('filterCommands', () => {
	it('lists every shortcut for an empty query', () => {
		expect(filterCommands('')).toHaveLength(CHAT_COMMANDS.length);
	});

	it('matches the command, the title and the keywords', () => {
		expect(filterCommands('analyze').every((entry) => entry.command === '/analyze')).toBe(true);
		expect(filterCommands('balances').map((entry) => t(entry.title))).toEqual([
			'Show account balances'
		]);
		expect(filterCommands('insights')).toHaveLength(1);
	});

	it('offers nothing the tools cannot answer', () => {
		for (const out of ['invoice', 'debt', 'budget', 'contact', 'runway']) {
			expect(filterCommands(out)).toEqual([]);
		}
	});
});
