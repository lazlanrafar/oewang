/**
 * Turning an API transaction into a table row.
 *
 * The table renders a signed figure in the wallet's own currency, with what
 * the user typed beside it when the two differed (TXN-21). Both stay
 * decimal strings the whole way (D12).
 */

import type { TransactionRow } from '$lib/components/organisms/data-table';
import { signedAmount } from '$lib/money';
import type { Transaction } from '$lib/server/ledger';

/** The day a row is grouped under, in the viewer's own zone. */
export function isoDay(timestamp: string): string {
	const moment = new Date(timestamp);
	const offset = moment.getTimezoneOffset() * 60_000;
	return new Date(moment.getTime() - offset).toISOString().slice(0, 10);
}

export function toRow(transaction: Transaction, locale = 'en-GB'): TransactionRow {
	const day = isoDay(transaction.date);

	return {
		id: transaction.id,
		day,
		date: new Intl.DateTimeFormat(locale, {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		}).format(new Date(transaction.date)),
		name: transaction.name ?? transaction.description ?? '',
		categoryId: transaction.category_id ?? '',
		walletId: transaction.wallet_id,
		// An expense and a transfer leave the wallet they are listed under;
		// income arrives. The sign is what the table colours on.
		amount: signedAmount(transaction.type, transaction.amount),
		currency: transaction.wallet_currency_code,
		originalAmount: transaction.original_amount
			? signedAmount(transaction.type, transaction.original_amount)
			: undefined,
		originalCurrency: transaction.original_currency_code ?? undefined,
		staleRate: transaction.base_rate_is_stale || undefined,
		staleRateDate: transaction.base_rate_is_stale ? transaction.base_rate_date : undefined,
		note: transaction.description ?? undefined
	};
}
