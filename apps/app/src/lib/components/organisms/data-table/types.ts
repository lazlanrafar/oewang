/** One row of the transactions table. */
export type TransactionRow = {
	id: string;
	/** ISO day, which is what rows are grouped by. */
	day: string;
	date: string;
	name: string;
	categoryId: string;
	walletId: string;
	/** A decimal string, signed. Never a number (D12). */
	amount: string;
	currency: string;
	note?: string;
};

export type NamedOption = { id: string; name: string; colorClass?: string };
