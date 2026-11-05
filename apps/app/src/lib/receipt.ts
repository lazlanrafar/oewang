/**
 * A parsed receipt, as the confirmation panel reads it (AI-1 to AI-3, AI-11).
 *
 * The API answers with a draft and a quality report, and persists nothing
 * (docs/features/chat.md#receipt-ocr). Everything here is pure, so the
 * rules that decide what the panel shows are tested without a browser and
 * without a model.
 *
 * Three jobs: read the response defensively, say what the code changed and
 * what the user should check, and preselect the wallet and the category so
 * the common receipt needs no picking at all.
 *
 * Every figure stays a string from the wire to the input (D12). Nothing
 * here adds a number, and `addDecimals` does the one sum there is on the
 * digits themselves.
 */

import { addDecimals, compareDecimals } from '$lib/money';

export type ReceiptLineItem = {
	name: string;
	/** Decimal strings, all four of them. */
	amount: string;
	quantity: string | null;
	unit_price: string | null;
};

export type ReceiptDraft = {
	merchant: string;
	/** An ISO day, `2026-11-02`. Empty when the model could not read one. */
	date: string;
	total: string;
	subtotal: string | null;
	tax: string | null;
	currency: string;
	line_items: ReceiptLineItem[];
};

/**
 * One field the API's arithmetic replaced, and what the model had said.
 *
 * `model_value` is the figure the model read, or null when the model gave
 * nothing at all and the arithmetic supplied the field outright. The two
 * are different statements and the panel says them differently: one is
 * "the code disagreed with the receipt, and here is what the receipt
 * said", the other is "the receipt did not say, so the code worked it out".
 */
export type ReceiptCorrection = { field: string; model_value: string | null };

/**
 * What the extraction thought of itself (AI-11).
 *
 * `corrected_fields` are figures the API's cross-field arithmetic
 * replaced, and `low_confidence_fields` are ones it could not check. The
 * difference matters to the user: one is a number the code is sure of, the
 * other is a number nobody is.
 */
export type ReceiptQuality = {
	score: number;
	low_confidence_fields: string[];
	corrected_fields: ReceiptCorrection[];
};

export type ParsedReceipt = {
	vault_file_id: string;
	draft: ReceiptDraft;
	quality: ReceiptQuality;
};

/** The fields the panel marks, in the order it renders them. */
export const RECEIPT_FIELDS = [
	'merchant',
	'date',
	'total',
	'subtotal',
	'tax',
	'currency',
	'line_items'
] as const;

export type ReceiptField = (typeof RECEIPT_FIELDS)[number];

/**
 * What to say about one field.
 *
 * - `corrected`: the model read a figure and the arithmetic disagreed. The
 *   panel shows what the model read, so the user can check the paper.
 * - `calculated`: the model read nothing and the arithmetic supplied it.
 *   There is no figure to show, only the fact that nobody read one.
 * - `check`: nothing was replaced and nothing was verified either.
 *
 * A replacement outranks a doubt, because it is the stronger statement:
 * the code did not merely doubt the figure, it changed it.
 */
export type ReceiptFlag = 'corrected' | 'calculated' | 'check' | null;

/** The correction for one field, with the model's own figure on it. */
export function correctionFor(
	field: string,
	quality: ReceiptQuality
): ReceiptCorrection | undefined {
	return quality.corrected_fields.find((correction) => correction.field === field);
}

export function fieldFlag(field: string, quality: ReceiptQuality): ReceiptFlag {
	const correction = correctionFor(field, quality);
	if (correction) return correction.model_value === null ? 'calculated' : 'corrected';
	if (quality.low_confidence_fields.includes(field)) return 'check';
	return null;
}

/**
 * Read the API's answer, checking every field rather than casting.
 *
 * The body crosses two service hops and comes from a model at the far end,
 * so a missing key is expected rather than exceptional. A response without
 * a usable draft returns null and the caller shows the manual path (AI-3),
 * which is the same path `RECEIPT_UNREADABLE` takes.
 */
export function parseReceiptResponse(value: unknown): ParsedReceipt | null {
	const body = record(value);
	const draft = record(body?.draft);
	if (!draft) return null;

	const quality = record(body?.quality);

	return {
		vault_file_id: string(body?.vault_file_id),
		draft: {
			merchant: string(draft.merchant),
			date: isoDay(string(draft.date)),
			total: decimal(draft.total),
			subtotal: optionalDecimal(draft.subtotal),
			tax: optionalDecimal(draft.tax),
			currency: string(draft.currency).toUpperCase(),
			line_items: lineItems(draft.line_items)
		},
		quality: {
			score: typeof quality?.score === 'number' ? quality.score : 0,
			low_confidence_fields: strings(quality?.low_confidence_fields),
			corrected_fields: corrections(quality?.corrected_fields)
		}
	};
}

/**
 * The corrections, named and with the model's figure.
 *
 * An entry without a field name says nothing a panel could render, so it
 * is dropped rather than shown as a badge on nothing.
 */
function corrections(value: unknown): ReceiptCorrection[] {
	if (!Array.isArray(value)) return [];

	const found: ReceiptCorrection[] = [];

	for (const entry of value) {
		const correction = record(entry);
		const field = string(correction?.field);
		if (field === '') continue;

		// A figure that is not a decimal string reads as "the model gave
		// nothing", which is what the panel says when it cannot quote one.
		found.push({ field, model_value: optionalDecimal(correction?.model_value) });
	}

	return found;
}

function lineItems(value: unknown): ReceiptLineItem[] {
	if (!Array.isArray(value)) return [];

	const items: ReceiptLineItem[] = [];

	for (const entry of value) {
		const item = record(entry);
		if (!item) continue;

		const name = string(item.name);
		const amount = decimal(item.amount);
		// A line with neither a name nor a figure is not a line. Keeping it
		// would put an empty editable row in front of the user for nothing.
		if (name === '' && amount === '') continue;

		items.push({
			name,
			amount,
			quantity: optionalDecimal(item.quantity),
			unit_price: optionalDecimal(item.unit_price)
		});
	}

	return items;
}

/**
 * The wallet a receipt lands in: the workspace default (WAL-3).
 *
 * Falls back to the first wallet, because a workspace with wallets and no
 * default is still a workspace the user can file a receipt in.
 */
export function defaultWalletId(wallets: ReadonlyArray<{ id: string; is_default: boolean }>): string {
	return (wallets.find((wallet) => wallet.is_default) ?? wallets[0])?.id ?? '';
}

export type CategoryChoice = { id: string; name: string; type?: string };

/**
 * The category a receipt looks like, or none.
 *
 * The merchant is tried before the line items, because "Warung Tekko" is a
 * better statement about the whole receipt than one item on it. A category
 * matches when its name appears as a whole word: a two-letter category
 * would otherwise match almost anything, so short names are skipped
 * entirely rather than matched loosely.
 *
 * Income categories are never offered. A receipt is money leaving.
 */
export function matchCategoryId(
	draft: Pick<ReceiptDraft, 'merchant' | 'line_items'>,
	categories: readonly CategoryChoice[]
): string {
	const candidates = categories.filter(
		(category) => category.type !== 'income' && normalise(category.name).length >= 3
	);
	if (candidates.length === 0) return '';

	const haystacks = [draft.merchant, ...draft.line_items.map((item) => item.name)];

	for (const text of haystacks) {
		const hay = normalise(text);
		if (hay === '') continue;

		const found = candidates.find((category) => containsWord(hay, normalise(category.name)));
		if (found) return found.id;
	}

	return '';
}

/**
 * What asking for a receipt can come back as.
 *
 * `unreadable` is an answer rather than a fault: the panel offers the
 * manual form with the image already attached (AI-3). Everything else is
 * a code the dictionary turns into a sentence.
 */
export type ReceiptRequest =
	| { status: 'ready'; parsed: ParsedReceipt }
	| { status: 'unreadable' }
	/** The reader did not answer; the receipt waits in the vault and is saved when it does (D95). */
	| { status: 'queued' }
	| { status: 'failed'; code: string };

/** The app's own route. The browser never calls the API (D5). */
const RECEIPT_ROUTE = '/transactions/receipt';

/**
 * Ask this app's server to read an uploaded receipt.
 *
 * The one impure function in this module, and it takes its `fetch`, so the
 * branch for each kind of failure is testable without a network. Nothing
 * here throws: a panel holding a draft the user is editing should not come
 * down because a retry failed.
 */
export async function requestReceipt(
	vaultFileId: string,
	fetcher: typeof fetch
): Promise<ReceiptRequest> {
	let response: Response;

	try {
		response = await fetcher(RECEIPT_ROUTE, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ vault_file_id: vaultFileId })
		});
	} catch {
		return { status: 'failed', code: 'STREAM_FAILED' };
	}

	if (response.status === 202) return { status: 'queued' };

	if (!response.ok) {
		const code = await failureCode(response);
		return code === 'RECEIPT_UNREADABLE' ? { status: 'unreadable' } : { status: 'failed', code };
	}

	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return { status: 'failed', code: 'STREAM_FAILED' };
	}

	const parsed = parseReceiptResponse(body);
	// A 200 with nothing usable in it is the same situation as a 422: the
	// image did not become a draft, and the manual form is the way on.
	return parsed === null ? { status: 'unreadable' } : { status: 'ready', parsed };
}

/** The code SvelteKit's `error()` carried, or a generic one. */
async function failureCode(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { message?: unknown };
		return typeof body.message === 'string' ? body.message : 'STREAM_FAILED';
	} catch {
		return 'STREAM_FAILED';
	}
}

export type ReceiptFormItem = {
	name: string;
	quantity: string;
	unitPrice: string;
	amount: string;
};

/**
 * The confirmation panel's own form (AI-2).
 *
 * Every parsed field is editable, so each one is a string the panel binds
 * to, including the figures: an input holds text, and an amount that
 * became a number on the way into a field would come back rounded (D12).
 */
export type ReceiptForm = {
	merchant: string;
	date: string;
	total: string;
	subtotal: string;
	tax: string;
	currency: string;
	walletId: string;
	categoryId: string;
	items: ReceiptFormItem[];
};

/**
 * Open the panel on what the model read, with the gaps filled.
 *
 * The wallet is the workspace default (WAL-3) and the category is whatever
 * the merchant or an item matches, so the common receipt needs no picking
 * at all. A date the model could not read falls back to today and is
 * flagged, which is the same thing the form sheet does with a blank date.
 */
export function toReceiptForm(
	parsed: ParsedReceipt,
	context: {
		wallets: ReadonlyArray<{ id: string; is_default: boolean }>;
		categories: readonly CategoryChoice[];
		baseCurrency: string;
		today: string;
	}
): ReceiptForm {
	return {
		merchant: parsed.draft.merchant,
		date: parsed.draft.date || context.today,
		total: parsed.draft.total,
		subtotal: parsed.draft.subtotal ?? '',
		tax: parsed.draft.tax ?? '',
		currency: parsed.draft.currency || context.baseCurrency,
		walletId: defaultWalletId(context.wallets),
		categoryId: matchCategoryId(parsed.draft, context.categories),
		items: parsed.draft.line_items.map((item) => ({
			name: item.name,
			quantity: item.quantity ?? '',
			unitPrice: item.unit_price ?? '',
			amount: item.amount
		}))
	};
}

/** Lowercase, with every run of punctuation collapsed to one space. */
function normalise(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function containsWord(haystack: string, needle: string): boolean {
	if (needle === '') return false;
	return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * What the line items add up to, or null when there are none.
 *
 * Shown against the stated total so a receipt whose items do not reach it
 * says so before it is saved. Items legitimately disagree with a total that
 * carries a service charge (TXN-12), so this is a note, never a block.
 */
export function itemsTotal(items: readonly ReceiptLineItem[]): string | null {
	const amounts = items.map((item) => item.amount).filter((amount) => amount !== '');
	return amounts.length === 0 ? null : addDecimals(amounts);
}

/** Whether the items disagree with the stated total, for the badge. */
export function itemsDisagree(draft: Pick<ReceiptDraft, 'total' | 'line_items'>): boolean {
	const sum = itemsTotal(draft.line_items);
	if (sum === null || draft.total === '') return false;
	return compareDecimals(sum, draft.total) !== 0;
}

/**
 * An ISO day, or empty.
 *
 * The model writes this field, so `2 November` and `next tuesday` both
 * reach here. Anything that is not a plain `YYYY-MM-DD` is dropped rather
 * than guessed at: an empty date input asks the user, a wrong one does not.
 */
function isoDay(value: string): string {
	const day = value.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';

	// A real day, not 2026-02-31. `Date` rolls an impossible day forward
	// rather than refusing it, so the round trip is what catches it.
	const parsed = new Date(`${day}T00:00:00Z`);
	return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? '' : day;
}

/** A decimal string, or empty. Never parsed into a number (D12). */
function decimal(value: unknown): string {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	return /^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : '';
}

function optionalDecimal(value: unknown): string | null {
	const parsed = decimal(value);
	return parsed === '' ? null : parsed;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function string(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
