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
	/**
	 * The ISO 4217 code the amount is denominated in, which is the wallet's
	 * own currency. A code rather than a symbol, because the code is what
	 * decides the precision: rupiah shows no decimals, dollars two.
	 */
	currency: string;
	/** What the user typed, when its currency differed from the wallet's (TXN-21). */
	originalAmount?: string;
	originalCurrency?: string;
	/** Written on a cached rate from another day, so the row is marked (TXN-22). */
	staleRate?: boolean;
	staleRateDate?: string;
	note?: string;
};

export type NamedOption = { id: string; name: string; colorClass?: string };
