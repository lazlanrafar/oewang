import { describe, expect, it } from 'vitest';

import { artifactsOf } from './artifacts';

import {
	deriveToolLabel,
	filesFromAttachments,
	presentToolCalls,
	toolCallsFromAttachments,
	toolDetail,
	toolLabel,
	type ToolCall
} from './chat-tools';

function call(overrides: Partial<ToolCall> = {}): ToolCall {
	return {
		id: 't1',
		name: 'create_transaction',
		args: {},
		status: 'ok',
		summary: 'Created expense 50,000 in Cash.',
		...overrides
	};
}

describe('toolLabel', () => {
	it('reads a written label for each of the eleven tools', () => {
		expect(toolLabel('create_transaction')).toBe('Creating transaction');
		expect(toolLabel('get_spending_summary')).toBe('Calculating summary');
		expect(toolLabel('present_choices')).toBe('Asking you to choose');
	});

	it('falls back to the name shape for a tool nobody has labelled', () => {
		// A tool added on the service side reads as progress the moment it
		// streams, rather than as an identifier.
		expect(toolLabel('archive_wallet')).toBe('Archiving wallet');
	});
});

describe('deriveToolLabel', () => {
	it('turns the verb into a gerund and keeps the rest', () => {
		expect(deriveToolLabel('update_budget')).toBe('Updating budget');
		expect(deriveToolLabel('list_wallet_groups')).toBe('Listing wallet groups');
	});

	it('drops a trailing e rather than doubling it', () => {
		expect(deriveToolLabel('merge_categories')).toBe('Merging categories');
	});

	it('doubles the consonant of a one-syllable verb, and only that', () => {
		expect(deriveToolLabel('get_rates')).toBe('Getting rates');
		expect(deriveToolLabel('tag_transaction')).toBe('Tagging transaction');
		// Two consonants, and two syllables: neither doubles.
		expect(deriveToolLabel('add_items')).toBe('Adding items');
		expect(deriveToolLabel('visit_wallet')).toBe('Visiting wallet');
		// `w`, `x` and `y` never double.
		expect(deriveToolLabel('fix_rate')).toBe('Fixing rate');
	});

	it('handles a one-word name', () => {
		expect(deriveToolLabel('search')).toBe('Searching');
	});

	it('says something rather than nothing for a name with no words', () => {
		expect(deriveToolLabel('___')).toBe('Working');
	});
});

describe('presentToolCalls', () => {
	it('shows nothing when no tool ran', () => {
		expect(presentToolCalls([])).toBeNull();
	});

	it('shows one finished call as its own label', () => {
		const view = presentToolCalls([call()]);

		expect(view).toMatchObject({ headline: 'Creating transaction', collapsible: false });
		expect(view?.running).toBeNull();
	});

	it('collapses several finished calls behind a count', () => {
		const view = presentToolCalls([
			call({ id: 't1' }),
			call({ id: 't2', name: 'get_spending_summary' }),
			call({ id: 't3', name: 'search_transactions' }),
			call({ id: 't4', name: 'get_recent_transactions' })
		]);

		expect(view).toMatchObject({ headline: 'Used 4 tools', collapsible: true });
		expect(view?.finished).toHaveLength(4);
	});

	it('gives the line to the call in flight', () => {
		// What is happening now is more informative than what has finished.
		const view = presentToolCalls([
			call({ id: 't1', name: 'search_transactions' }),
			call({ id: 't2', name: 'create_wallet', status: 'running', summary: null })
		]);

		expect(view).toMatchObject({ headline: 'Creating wallet', collapsible: false });
		expect(view?.running?.id).toBe('t2');
		expect(view?.finished).toHaveLength(1);
	});
});

describe('toolCallsFromAttachments', () => {
	it('reads the shape the API stores on a message', () => {
		const calls = toolCallsFromAttachments({
			tool_calls: [
				{
					id: 't1',
					name: 'create_transaction',
					args: { amount: '50000' },
					result: { ok: true, summary: 'Created expense 50,000 in Cash.' }
				}
			]
		});

		expect(calls).toEqual([
			{
				id: 't1',
				name: 'create_transaction',
				args: { amount: '50000' },
				status: 'ok',
				summary: 'Created expense 50,000 in Cash.',
				artifact: null
			}
		]);
	});

	it('reads back the artifact an analysis call stored (D88)', () => {
		const payload = { from: '2026-11-01', to: '2026-11-30' };
		const calls = toolCallsFromAttachments({
			tool_calls: [
				{
					id: 't1',
					name: 'get_burn_rate',
					result: { ok: true, summary: 'x' },
					artifact: { type: 'burn-rate', payload }
				},
				{
					id: 't2',
					name: 'get_burn_rate',
					result: { ok: true, summary: 'x' },
					artifact: { type: 'nonsense', payload }
				}
			]
		});

		expect(calls[0].artifact).toEqual({ kind: 'burn-rate', payload });
		expect(calls[1].artifact).toBeNull();
		expect(artifactsOf([{ toolCalls: calls }]).map((entry) => entry.id)).toEqual(['t1']);
		// The live and the stored copy of one answer give one tab.
		expect(
			artifactsOf([{ toolCalls: calls }, { toolCalls: calls }]).map((entry) => entry.id)
		).toEqual(['t1']);
	});

	it('reports a refused call as failed', () => {
		const calls = toolCallsFromAttachments({
			tool_calls: [{ id: 't1', name: 'delete_transaction', result: { ok: false } }]
		});

		expect(calls[0]).toMatchObject({ status: 'failed', summary: null });
	});

	it('leaves a call that never answered as running', () => {
		const calls = toolCallsFromAttachments({
			tool_calls: [{ id: 't1', name: 'create_wallet' }]
		});

		expect(calls[0].status).toBe('running');
	});

	it('skips an entry with no id or no name, and anything that is not a list', () => {
		expect(toolCallsFromAttachments({ tool_calls: [{ name: 'create_wallet' }, 7] })).toEqual([]);
		expect(toolCallsFromAttachments({ tool_calls: 'none' })).toEqual([]);
		expect(toolCallsFromAttachments(null)).toEqual([]);
		expect(toolCallsFromAttachments('{}')).toEqual([]);
	});
});

describe('filesFromAttachments', () => {
	it('reads the files stored with a message', () => {
		const files = filesFromAttachments({
			files: [{ vault_file_id: 'f1', name: 'receipt.jpg', type: 'image/jpeg' }]
		});

		expect(files).toEqual([{ id: 'f1', name: 'receipt.jpg', type: 'image/jpeg' }]);
	});

	it('names a file after its id when the record has no name', () => {
		expect(filesFromAttachments({ files: [{ vault_file_id: 'f1' }] })).toEqual([
			{ id: 'f1', name: 'f1', type: '' }
		]);
	});

	it('skips a record with no file id', () => {
		expect(filesFromAttachments({ files: [{ name: 'receipt.jpg' }] })).toEqual([]);
	});
});

describe('toolDetail', () => {
	it('names the range a call covers', () => {
		expect(toolDetail({ args: { from: '2026-09-01', to: '2026-11-30' } })).toBe(
			'1 Sept to 30 Nov 2026'
		);
	});

	it('quotes a search phrase, shortened', () => {
		expect(toolDetail({ args: { query: 'warung' } })).toBe('“warung”');
		expect(toolDetail({ args: { query: 'x'.repeat(60) } })?.length).toBe(42);
	});

	it('shows nothing it cannot read', () => {
		expect(toolDetail({ args: { amount: '50000' } })).toBeNull();
		expect(toolDetail({ args: { from: 'yesterday', to: 'today' } })).toBeNull();
	});
});
