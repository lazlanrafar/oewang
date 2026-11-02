/**
 * An API transaction plus its audit trail, as the detail sheet renders it.
 *
 * All the formatting lives here rather than in the component, so the sheet
 * stays a layout and the rules about which currency a figure is in stay in
 * one place.
 */

import type { TransactionDetail } from '$lib/components/organisms/transactions';
import { formatMoney, signedAmount } from '$lib/money';
import type { HistoryEntry, Transaction } from '$lib/server/ledger';

/** `wallet.balance` before and after, and the fields a reader cares about. */
const WATCHED = ['amount', 'date', 'category_id', 'wallet_id', 'is_ready', 'name', 'description'];

export function toDetail(
	transaction: Transaction,
	history: HistoryEntry[],
	baseCurrency: string,
	locale = 'en-GB'
): TransactionDetail {
	const signed = signedAmount(transaction.type, transaction.amount);

	return {
		id: transaction.id,
		name: transaction.name ?? transaction.description ?? '—',
		amount: formatMoney(signed, transaction.wallet_currency_code, { signed: true }),
		income: transaction.type === 'income',
		date: new Intl.DateTimeFormat(locale, {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		}).format(new Date(transaction.date)),
		account: transaction.wallet_name,
		toAccount: transaction.to_wallet_name,
		category: transaction.category_name,
		type: transaction.type,
		ready: transaction.is_ready,
		notes: transaction.description,
		originalAmount:
			transaction.original_amount && transaction.original_currency_code
				? formatMoney(transaction.original_amount, transaction.original_currency_code)
				: null,
		baseAmount: formatMoney(transaction.base_amount, baseCurrency),
		exchangeRate: transaction.exchange_rate,
		baseRate: transaction.base_rate,
		baseRateSource: transaction.base_rate_source,
		baseRateDate: transaction.base_rate_date,
		baseRateStale: transaction.base_rate_is_stale,
		receivedAmount:
			transaction.to_amount && transaction.to_wallet_name
				? formatMoney(transaction.to_amount, transaction.wallet_currency_code)
				: null,
		// Line items and attachments arrive with M3; the sheet already has a
		// place for them and says "none" until then.
		items: [],
		attachments: [],
		history: history.map((entry) => ({
			id: entry.id,
			at: new Intl.DateTimeFormat(locale, {
				day: '2-digit',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			}).format(new Date(entry.created_at)),
			who: entry.actor_name ?? entry.actor_email,
			source: entry.source,
			what: describe(entry)
		}))
	};
}

/**
 * What changed, in words.
 *
 * A diff of the fields a reader asks about, rather than the whole row: an
 * audit entry that says "fourteen columns changed" answers nothing.
 */
function describe(entry: HistoryEntry): string {
	if (entry.action.endsWith('.created')) return 'created this transaction';
	if (entry.action.endsWith('.deleted')) return 'deleted this transaction';

	const before = entry.before ?? {};
	const after = entry.after ?? {};
	const changes = WATCHED.filter(
		(field) => JSON.stringify(before[field]) !== JSON.stringify(after[field])
	).map((field) => `${field} ${format(before[field])} to ${format(after[field])}`);

	return changes.length > 0 ? `changed ${changes.join(', ')}` : 'changed this transaction';
}

function format(value: unknown): string {
	if (value === null || value === undefined) return 'none';
	return String(value);
}
