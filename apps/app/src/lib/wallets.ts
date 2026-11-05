/**
 * Wallet grouping and totals, shared by the page and its server load.
 *
 * No server imports, so the page can use it directly.
 */

import { addDecimals, multiplyDecimals } from '$lib/money';

export type WalletLike = {
	id: string;
	group_id: string | null;
	group_name: string | null;
	name: string;
	currency_code: string;
	balance: string;
	is_included_in_totals: boolean;
	is_default: boolean;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

export type WalletGroupView<T extends WalletLike> = {
	id: string | null;
	name: string | null;
	wallets: T[];
	/** In the workspace currency, or null when a rate was missing. */
	total: string | null;
	/** How many wallets had no rate, so the page can say the total is partial. */
	unconverted: number;
};

/**
 * A wallet balance in the workspace currency.
 *
 * `null` when no rate exists for that pair. This is the one read path that
 * converts: a balance is a live figure in its wallet's own currency and has
 * no stored `base_amount` to sum, unlike a transaction (TXN-19).
 */
export function inBaseCurrency(
	balance: string,
	currency: string,
	base: string,
	rates: Record<string, string>
): string | null {
	if (currency === base) return balance;
	const rate = rates[currency];
	return rate ? multiplyDecimals(balance, rate) : null;
}

/**
 * Wallets grouped for display, ungrouped last, each group carrying its
 * total in the workspace currency.
 *
 * The groups come in separately rather than being derived from the wallets:
 * a group with no wallets in it still has to render, or a group created
 * before its first wallet is invisible and cannot be edited or deleted.
 *
 * Only wallets flagged "include in totals" count towards the total (WAL-2).
 */
export function groupWallets<T extends WalletLike>(
	wallets: T[],
	groups: Array<{ id: string; name: string }>,
	base: string,
	rates: Record<string, string>
): Array<WalletGroupView<T>> {
	const views = new Map<string | null, WalletGroupView<T>>();

	for (const group of groups) {
		views.set(group.id, {
			id: group.id,
			name: group.name,
			wallets: [],
			total: null,
			unconverted: 0
		});
	}

	for (const wallet of wallets) {
		const key = wallet.group_id;
		if (!views.has(key)) {
			views.set(key, {
				id: key,
				name: wallet.group_name,
				wallets: [],
				total: null,
				unconverted: 0
			});
		}
		views.get(key)!.wallets.push(wallet);
	}

	// A workspace with no groups at all shows one unlabelled section rather
	// than an empty page.
	if (views.size === 0) {
		views.set(null, { id: null, name: null, wallets: [], total: null, unconverted: 0 });
	}

	for (const group of views.values()) {
		const converted: string[] = [];
		for (const wallet of group.wallets) {
			if (!wallet.is_included_in_totals) continue;
			const value = inBaseCurrency(wallet.balance, wallet.currency_code, base, rates);
			if (value === null) group.unconverted += 1;
			else converted.push(value);
		}
		group.total = addDecimals(converted);
	}

	// Ungrouped wallets come last; the rest keep the order the API sent.
	return [...views.values()].sort((a, b) => {
		if (a.id === b.id) return 0;
		if (a.id === null) return 1;
		if (b.id === null) return -1;
		return 0;
	});
}

/**
 * The three figures the accounts page puts above its table.
 *
 * `groupWallets` answers per group; this answers for the workspace. Both
 * count only wallets flagged "include in totals" (WAL-2), and both leave a
 * wallet out of the total when no rate exists for its currency rather than
 * adding it as if it were already in the workspace's.
 */
export type WalletTotals = {
	/** In the workspace currency. */
	total: string;
	/** Every live wallet, counted or not. */
	count: number;
	/** How many carry the flag, which is what the total is a total of. */
	counted: number;
	/** How many were left out for want of a rate, so the page can say so. */
	unconverted: number;
};

export function walletTotals(
	wallets: WalletLike[],
	base: string,
	rates: Record<string, string>
): WalletTotals {
	const converted: string[] = [];
	let counted = 0;
	let unconverted = 0;

	for (const wallet of wallets) {
		if (!wallet.is_included_in_totals) continue;
		counted += 1;

		const value = inBaseCurrency(wallet.balance, wallet.currency_code, base, rates);
		if (value === null) unconverted += 1;
		else converted.push(value);
	}

	return { total: addDecimals(converted), count: wallets.length, counted, unconverted };
}
