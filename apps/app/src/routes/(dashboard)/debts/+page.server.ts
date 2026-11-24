import { fail } from '@sveltejs/kit';

import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { DEBT_SORTS, DEBT_STATUSES, DEBT_TYPES } from '$lib/debts';
import { ApiError } from '$lib/server/api';
import * as debtsApi from '$lib/server/debts';
import { run, text } from '$lib/server/form-action';
import * as ledger from '$lib/server/ledger';
import { readParam, readValues } from '$lib/url-state';

import type { Actions, PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * The debts screen (DEBT-11, D120).
 *
 * Every filter, the sort, the page and each open sheet live in the URL
 * (UI-8, D55): `?debt=` opens a debt's sheet and `?source=` the form for a debt made from that transaction (DEBT-9,
 * DEBT-12). The sheets' data is read here, because only the server calls
 * the API (D5).
 */
export const load: PageServerLoad = async ({ depends, locals, url }) => {
	depends(INVALIDATION_KEYS.transactions, INVALIDATION_KEYS.walletBalances);
	const token = locals.accessToken;

	const search = (url.searchParams.get('search') ?? '').trim();
	const statuses = readValues(url, 'status').filter((value) =>
		(DEBT_STATUSES as readonly string[]).includes(value)
	);
	const type = readValues(url, 'type').find((value) => (DEBT_TYPES as readonly string[]).includes(value));
	const contactId = (url.searchParams.get('contact_id') ?? '').trim();
	const sort = readParam(url, 'sort', DEBT_SORTS, 'due_date');
	const order = readParam(url, 'order', ['asc', 'desc'] as const, 'asc');
	const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const query = new URLSearchParams({ sort, order, limit: String(PAGE_SIZE) });
	if (search) query.set('search', search);
	for (const status of statuses) query.append('status', status);
	if (type) query.set('type', type);
	if (contactId) query.set('contact_id', contactId);

	const debtId = url.searchParams.get('debt');
	const sourceId = url.searchParams.get('source');

	// shortcut: the cards count overdue against the API's UTC date; the rows
	// mark overdue against the reader's own. Upgrade when the app learns the
	// reader's time zone on the server.
	const [debts, summary, open, source] = await Promise.all([
		debtsApi.listDebts(new URLSearchParams([...query, ['page', String(page)]]), token),
		debtsApi.debtSummary(new URLSearchParams(), token),
		debtId ? debtsApi.readDebt(debtId, token).then((r) => r.data, () => null) : null,
		sourceId ? loadSource(sourceId, token) : null
	]);

	return {
		debts: debts.data ?? [],
		meta: debts.meta,
		summary: summary.data!,
		open,
		source,
		/** What makes this a different list rather than more of the same one. */
		filterKey: query.toString(),
		filtered: search !== '' || statuses.length > 0 || !!type || contactId !== ''
	};
};

/** The transaction a new debt is made from: what the form shows and defaults to. */
async function loadSource(id: string, token?: string) {
	try {
		const transaction = (await ledger.readTransaction(id, token)).data;
		if (!transaction) return null;
		return {
			id: transaction.id,
			name: transaction.name ?? transaction.description ?? '—',
			amount: transaction.amount,
			currency_code: transaction.wallet_currency_code
		};
	} catch {
		return null;
	}
}

/** An empty optional field is absent, not an empty string the API has to read. */
const optional = (form: FormData, key: string) => text(form, key) || null;

/** The date picker holds a day; the API wants an instant, and midday keeps it on that day. */
const instant = (day: string) => new Date(`${day}T12:00:00`).toISOString();

/** Form actions, so every write works with JavaScript off. */
export const actions: Actions = {
	create: async ({ request, locals }) =>
		run(request, (form) =>
			debtsApi.createDebt(
				{
					type: text(form, 'type') as debtsApi.DebtType,
					contact_id: text(form, 'contact_id'),
					amount: text(form, 'amount'),
					currency_code: optional(form, 'currency_code') ?? undefined,
					due_date: optional(form, 'due_date'),
					description: optional(form, 'description'),
					source_transaction_id: optional(form, 'source_transaction_id')
				},
				locals.accessToken
			)
		),

	/*
	 * Type and currency travel only when they changed: the API refuses
	 * either once a payment exists (DEBT-2), and sending them unchanged
	 * would turn every edit of a partly paid debt into that refusal.
	 */
	update: async ({ request, locals }) =>
		run(request, async (form) => {
			const id = text(form, 'id');
			const current = (await debtsApi.readDebt(id, locals.accessToken)).data!;
			const type = text(form, 'type') as debtsApi.DebtType;
			const currency = text(form, 'currency_code');
			return debtsApi.updateDebt(
				id,
				{
					contact_id: text(form, 'contact_id'),
					amount: text(form, 'amount'),
					due_date: optional(form, 'due_date'),
					description: optional(form, 'description'),
					...(type && type !== current.type ? { type } : {}),
					...(currency && currency !== current.currency_code ? { currency_code: currency } : {})
				},
				locals.accessToken
			);
		}),

	delete: async ({ request, locals }) =>
		run(request, (form) => debtsApi.deleteDebt(text(form, 'id'), locals.accessToken)),

	/*
	 * The API has no bulk delete, so this is one call per debt, in order.
	 * The first refusal stops the rest and says how many went, because a
	 * debt with payments is refused (DEBT-3) and the person needs to know
	 * which part of the selection is still there.
	 */
	bulkDelete: async ({ request, locals }) => {
		const ids = (await request.formData()).getAll('id').map(String).filter(Boolean);
		let deleted = 0;
		for (const id of ids) {
			try {
				await debtsApi.deleteDebt(id, locals.accessToken);
				deleted += 1;
			} catch (error) {
				if (error instanceof ApiError) return fail(error.status, { code: error.code, deleted });
				throw error;
			}
		}
		return { ok: true, deleted };
	},

	pay: async ({ request, locals }) =>
		run(request, (form) =>
			debtsApi.payDebt(
				text(form, 'id'),
				{
					amount: text(form, 'amount'),
					wallet_id: optional(form, 'wallet_id'),
					date: instant(text(form, 'date')),
					exchange_rate: optional(form, 'exchange_rate')
				},
				locals.accessToken
			)
		),

	cancelPayment: async ({ request, locals }) =>
		run(request, (form) =>
			debtsApi.cancelPayment(text(form, 'id'), text(form, 'payment_id'), locals.accessToken)
		),

	bulkPay: async ({ request, locals }) =>
		run(request, (form) => {
			const amounts = form.getAll('amount').map(String);
			return debtsApi.bulkPay(
				{
					wallet_id: optional(form, 'wallet_id'),
					date: instant(text(form, 'date')),
					payments: form
						.getAll('debt_id')
						.map((id, index) => ({ debt_id: String(id), amount: amounts[index] ?? '' }))
				},
				locals.accessToken
			);
		})
};
