/**
 * The card a transaction saved from the web chat is answered with (OEW-135).
 *
 * The API builds it from the database and sends it as an `artifact` event of
 * type `transaction`, the same way it sends an analysis (D88); it is stored
 * on the tool call and re-read by id each time the conversation loads. So
 * the shape is the API's own, every figure already formatted (D27) and no
 * amount ever a number (D12). It is drawn inline under the reply rather than
 * in the canvas.
 */

export const CARD_KIND = 'transaction';

export type TransactionCard = {
	transaction_id: string;
	type: 'expense' | 'income' | 'transfer';
	name: string | null;
	amount_formatted: string;
	category_id: string | null;
	category_name: string | null;
	wallet_id: string;
	wallet_name: string;
	to_wallet_name: string | null;
	/** YYYY-MM-DD. */
	date: string;
	items: { name: string; amount_formatted: string }[];
	/** This month's expense total when the row was saved. */
	month_total_formatted?: string | null;
	deleted: boolean;
};

/** A card from loose JSON: the stream frame or the stored attachment. */
export function readTransactionCard(type: unknown, payload: unknown): TransactionCard | null {
	if (type !== CARD_KIND) return null;
	if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;

	const card = payload as Partial<TransactionCard>;
	if (typeof card.transaction_id !== 'string' || card.transaction_id === '') return null;

	return { ...card, items: Array.isArray(card.items) ? card.items : [] } as TransactionCard;
}

/**
 * The one month total a reply closes on.
 *
 * The last card's: it was worked out after every write before it in the
 * same turn, so it is the newest figure the reply has.
 */
export function closingTotal(cards: TransactionCard[]): string | null {
	return cards.at(-1)?.month_total_formatted ?? null;
}
