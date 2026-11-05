import { describe, expect, it } from 'vitest';

import {
	correctionFor,
	defaultWalletId,
	fieldFlag,
	itemsDisagree,
	itemsTotal,
	matchCategoryId,
	parseReceiptResponse,
	requestReceipt,
	toReceiptForm,
	type ParsedReceipt,
	type ReceiptQuality
} from './receipt';

const response = {
	vault_file_id: 'clxfile',
	draft: {
		merchant: 'Warung Tekko',
		date: '2026-11-02',
		total: '87500.0000',
		subtotal: '80000.0000',
		tax: '7500.0000',
		currency: 'idr',
		line_items: [
			{ name: 'Iga bakar', amount: '45000.0000', quantity: '1', unit_price: '45000.0000' }
		]
	},
	quality: {
		score: 62,
		low_confidence_fields: ['date'],
		corrected_fields: [{ field: 'total', model_value: '8750' }]
	}
};

const quality = (overrides: Partial<ReceiptQuality> = {}): ReceiptQuality => ({
	score: 80,
	low_confidence_fields: [],
	corrected_fields: [],
	...overrides
});

describe('parseReceiptResponse', () => {
	it('reads the draft and the quality report', () => {
		const parsed = parseReceiptResponse(response);

		expect(parsed).not.toBeNull();
		expect(parsed?.vault_file_id).toBe('clxfile');
		expect(parsed?.draft.merchant).toBe('Warung Tekko');
		expect(parsed?.draft.total).toBe('87500.0000');
		// Uppercased here so the formatter never sees `idr`.
		expect(parsed?.draft.currency).toBe('IDR');
		expect(parsed?.quality).toEqual({
			score: 62,
			low_confidence_fields: ['date'],
			corrected_fields: [{ field: 'total', model_value: '8750' }]
		});
	});

	it('keeps every figure a string', () => {
		const parsed = parseReceiptResponse(response);

		expect(typeof parsed?.draft.total).toBe('string');
		expect(typeof parsed?.draft.line_items[0].amount).toBe('string');
		expect(typeof parsed?.draft.line_items[0].unit_price).toBe('string');
	});

	it('returns null without a draft', () => {
		expect(parseReceiptResponse(null)).toBeNull();
		expect(parseReceiptResponse({})).toBeNull();
		expect(parseReceiptResponse({ draft: 'Warung Tekko' })).toBeNull();
	});

	it('drops a figure that is not a decimal string', () => {
		// The far end of two hops is a model. A number, a currency symbol
		// and a null all arrive here, and none of them is an amount.
		const parsed = parseReceiptResponse({
			draft: { total: 87500, subtotal: 'Rp 80.000', tax: null, line_items: [] }
		});

		expect(parsed?.draft.total).toBe('');
		expect(parsed?.draft.subtotal).toBeNull();
		expect(parsed?.draft.tax).toBeNull();
	});

	it('drops a date that is not a real day', () => {
		for (const date of ['2 November', 'next tuesday', '2026-02-31', '2026-13-01', '']) {
			expect(parseReceiptResponse({ draft: { date, line_items: [] } })?.draft.date).toBe('');
		}
	});

	it('keeps a date that is one', () => {
		expect(parseReceiptResponse({ draft: { date: '2026-11-02', line_items: [] } })?.draft.date).toBe(
			'2026-11-02'
		);
	});

	it('drops a line with neither a name nor a figure', () => {
		const parsed = parseReceiptResponse({
			draft: {
				line_items: [{ name: '', amount: '' }, { name: 'Es teh', amount: '8000' }, 'nonsense']
			}
		});

		expect(parsed?.draft.line_items).toEqual([
			{ name: 'Es teh', amount: '8000', quantity: null, unit_price: null }
		]);
	});

	it('reads a correction without a field name as nothing to show', () => {
		// A badge on no field is a badge on nothing.
		const parsed = parseReceiptResponse({
			draft: { line_items: [] },
			quality: { corrected_fields: [{ model_value: '8750' }, 'total', { field: 'tax' }] }
		});

		expect(parsed?.quality.corrected_fields).toEqual([{ field: 'tax', model_value: null }]);
	});

	it('survives a quality report that is missing', () => {
		const parsed = parseReceiptResponse({ draft: { line_items: [] } });

		expect(parsed?.quality).toEqual({ score: 0, low_confidence_fields: [], corrected_fields: [] });
	});
});

describe('fieldFlag', () => {
	it('marks a figure the arithmetic disagreed with', () => {
		const replaced = quality({ corrected_fields: [{ field: 'total', model_value: '8750' }] });
		expect(fieldFlag('total', replaced)).toBe('corrected');
	});

	it('marks a figure the model never read as calculated, not corrected', () => {
		// Two different statements. One is "the code disagreed with the
		// receipt"; the other is "the receipt did not say".
		const supplied = quality({ corrected_fields: [{ field: 'tax', model_value: null }] });
		expect(fieldFlag('tax', supplied)).toBe('calculated');
	});

	it('marks a field the user should check', () => {
		expect(fieldFlag('date', quality({ low_confidence_fields: ['date'] }))).toBe('check');
	});

	it('prefers a replacement over a doubt', () => {
		// The stronger statement wins: the code did not merely doubt the
		// figure, it changed it.
		const both = quality({
			corrected_fields: [{ field: 'total', model_value: '8750' }],
			low_confidence_fields: ['total']
		});
		expect(fieldFlag('total', both)).toBe('corrected');
	});

	it('says nothing about a field in neither list', () => {
		expect(fieldFlag('merchant', quality())).toBeNull();
	});
});

describe('correctionFor', () => {
	it('hands back what the model read, so the sheet can quote it', () => {
		const replaced = quality({ corrected_fields: [{ field: 'total', model_value: '8750' }] });

		expect(correctionFor('total', replaced)).toEqual({ field: 'total', model_value: '8750' });
		expect(correctionFor('tax', replaced)).toBeUndefined();
	});
});

describe('defaultWalletId', () => {
	it('picks the workspace default', () => {
		expect(
			defaultWalletId([
				{ id: 'w1', is_default: false },
				{ id: 'w2', is_default: true }
			])
		).toBe('w2');
	});

	it('falls back to the first wallet', () => {
		expect(
			defaultWalletId([
				{ id: 'w1', is_default: false },
				{ id: 'w2', is_default: false }
			])
		).toBe('w1');
	});

	it('answers empty for a workspace with no wallets', () => {
		expect(defaultWalletId([])).toBe('');
	});
});

describe('matchCategoryId', () => {
	const categories = [
		{ id: 'c1', name: 'Food', type: 'expense' },
		{ id: 'c2', name: 'Transport', type: 'expense' },
		{ id: 'c3', name: 'Salary', type: 'income' }
	];

	it('matches the merchant', () => {
		const draft = { merchant: 'Food Hall Senayan', line_items: [] };
		expect(matchCategoryId(draft, categories)).toBe('c1');
	});

	it('matches a line item when the merchant says nothing', () => {
		const draft = {
			merchant: 'Warung Tekko',
			line_items: [{ name: 'Transport fee', amount: '10000', quantity: null, unit_price: null }]
		};

		expect(matchCategoryId(draft, categories)).toBe('c2');
	});

	it('prefers the merchant over a line item', () => {
		// The merchant is a statement about the whole receipt; one item is not.
		const draft = {
			merchant: 'Food Hall',
			line_items: [{ name: 'Transport fee', amount: '10000', quantity: null, unit_price: null }]
		};

		expect(matchCategoryId(draft, categories)).toBe('c1');
	});

	it('ignores case and punctuation', () => {
		const draft = { merchant: 'WARUNG-FOOD, Jakarta', line_items: [] };
		expect(matchCategoryId(draft, categories)).toBe('c1');
	});

	it('never preselects an income category', () => {
		const draft = { merchant: 'Salary Bistro', line_items: [] };
		expect(matchCategoryId(draft, categories)).toBe('');
	});

	it('skips a category name too short to mean anything', () => {
		// A two-letter category would match almost any merchant string.
		const draft = { merchant: 'Toko Bu Ani', line_items: [] };
		expect(matchCategoryId(draft, [{ id: 'c9', name: 'Bu' }])).toBe('');
	});

	it('matches whole words only', () => {
		const draft = { merchant: 'Seafood Market', line_items: [] };
		expect(matchCategoryId(draft, categories)).toBe('');
	});

	it('answers empty when nothing matches', () => {
		const draft = { merchant: 'Warung Tekko', line_items: [] };
		expect(matchCategoryId(draft, categories)).toBe('');
	});
});

describe('requestReceipt', () => {
	const answering = (body: unknown, init?: ResponseInit) =>
		(() => Promise.resolve(new Response(JSON.stringify(body), init))) as unknown as typeof fetch;

	it('asks this app rather than the API', async () => {
		// The browser holds no token and never calls the API (D5).
		const calls: string[] = [];
		const fetcher = ((url: string) => {
			calls.push(url);
			return Promise.resolve(new Response(JSON.stringify(response)));
		}) as unknown as typeof fetch;

		await requestReceipt('clxfile', fetcher);

		expect(calls).toEqual(['/transactions/receipt']);
	});

	it('returns the parsed draft', async () => {
		const result = await requestReceipt('clxfile', answering(response));

		expect(result.status).toBe('ready');
		expect(result.status === 'ready' && result.parsed.draft.merchant).toBe('Warung Tekko');
	});

	it('reads RECEIPT_UNREADABLE as an answer, not a fault', async () => {
		const result = await requestReceipt(
			'clxfile',
			answering({ message: 'RECEIPT_UNREADABLE' }, { status: 422 })
		);

		expect(result).toEqual({ status: 'unreadable' });
	});

	it('reads a 202 as queued: the reader was busy and the receipt waits (D95)', async () => {
		const result = await requestReceipt('clxfile', answering({ queued: true }, { status: 202 }));

		expect(result).toEqual({ status: 'queued' });
	});

	it('carries any other code through for the dictionary', async () => {
		const result = await requestReceipt(
			'clxfile',
			answering({ message: 'RATE_LIMITED' }, { status: 429 })
		);

		expect(result).toEqual({ status: 'failed', code: 'RATE_LIMITED' });
	});

	it('treats a 200 with nothing usable in it as unreadable', async () => {
		expect(await requestReceipt('clxfile', answering({ data: null }))).toEqual({
			status: 'unreadable'
		});
	});

	it('never throws when the network does', async () => {
		// The panel may be holding a draft the user is editing.
		const fetcher = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

		expect(await requestReceipt('clxfile', fetcher)).toEqual({
			status: 'failed',
			code: 'STREAM_FAILED'
		});
	});
});

describe('toReceiptForm', () => {
	const parsed = parseReceiptResponse(response) as ParsedReceipt;

	const context = {
		wallets: [
			{ id: 'w1', is_default: false },
			{ id: 'w2', is_default: true }
		],
		categories: [{ id: 'c1', name: 'Food', type: 'expense' }],
		baseCurrency: 'IDR',
		today: '2026-11-03'
	};

	it('opens on what the model read', () => {
		expect(toReceiptForm(parsed, context)).toEqual({
			merchant: 'Warung Tekko',
			date: '2026-11-02',
			total: '87500.0000',
			subtotal: '80000.0000',
			tax: '7500.0000',
			currency: 'IDR',
			walletId: 'w2',
			categoryId: '',
			items: [
				{ name: 'Iga bakar', quantity: '1', unitPrice: '45000.0000', amount: '45000.0000' }
			]
		});
	});

	it('preselects a category the merchant matches', () => {
		const food = { ...parsed, draft: { ...parsed.draft, merchant: 'Food Hall' } };
		expect(toReceiptForm(food, context).categoryId).toBe('c1');
	});

	it('falls back to today for a date the model could not read', () => {
		const undated = { ...parsed, draft: { ...parsed.draft, date: '' } };
		expect(toReceiptForm(undated, context).date).toBe('2026-11-03');
	});

	it('falls back to the workspace currency', () => {
		const anonymous = { ...parsed, draft: { ...parsed.draft, currency: '' } };
		expect(toReceiptForm(anonymous, context).currency).toBe('IDR');
	});

	it('keeps every figure a string, empty rather than null', () => {
		const sparse = {
			...parsed,
			draft: {
				...parsed.draft,
				subtotal: null,
				tax: null,
				line_items: [{ name: 'Es teh', amount: '8000', quantity: null, unit_price: null }]
			}
		};

		expect(toReceiptForm(sparse, context)).toMatchObject({
			subtotal: '',
			tax: '',
			items: [{ name: 'Es teh', quantity: '', unitPrice: '', amount: '8000' }]
		});
	});
});

describe('itemsTotal', () => {
	it('adds the line amounts without parsing them', () => {
		expect(
			itemsTotal([
				{ name: 'Iga bakar', amount: '45000.0000', quantity: null, unit_price: null },
				{ name: 'Es teh', amount: '8000.0000', quantity: null, unit_price: null }
			])
		).toBe('53000.0000');
	});

	it('answers null with no items', () => {
		expect(itemsTotal([])).toBeNull();
	});
});

describe('itemsDisagree', () => {
	const items = [{ name: 'Iga bakar', amount: '45000', quantity: null, unit_price: null }];

	it('notices items that do not reach the total', () => {
		// A service charge makes this legitimate (TXN-12), so it is a note
		// rather than a block. The panel still has to be able to say it.
		expect(itemsDisagree({ total: '87500', line_items: items })).toBe(true);
	});

	it('says nothing when they add up, whatever the trailing zeroes', () => {
		expect(itemsDisagree({ total: '45000.0000', line_items: items })).toBe(false);
	});

	it('says nothing without items or without a total', () => {
		expect(itemsDisagree({ total: '87500', line_items: [] })).toBe(false);
		expect(itemsDisagree({ total: '', line_items: items })).toBe(false);
	});
});
