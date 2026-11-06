import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { formatMoney } from '$lib/money';
import { currentMonth } from '$lib/month-range';
import * as ledger from '$lib/server/ledger';
import * as reports from '$lib/server/reports';
import { readText } from '$lib/url-state';
import { walletTotals } from '$lib/wallets';

import type { PageServerLoad } from './$types';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The overview (D87, OVR-1 to OVR-4).
 *
 * The figures for the range in `?from&to`, the current month when the URL
 * names none (the owner's choice, replacing D87's year), and the wallets for the tracked balance. Read together:
 * neither depends on the other.
 *
 * It declares the keys a chat write drops (D32), so a transaction created
 * from the assistant moves these numbers without a reload.
 */
export const load: PageServerLoad = async ({ depends, locals, url, parent }) => {
	const token = locals.accessToken;
	const { me } = await parent();
	const base = me.workspace.currency_code;

	depends(INVALIDATION_KEYS.overview, INVALIDATION_KEYS.summary, INVALIDATION_KEYS.walletBalances);

	const fallback = currentMonth();
	const from = readText(url, 'from');
	const to = readText(url, 'to');
	// A half-written or malformed range falls back to the default as a
	// whole, rather than pairing the URL's start with the default's end.
	const range =
		DAY.test(from) && DAY.test(to) && from <= to ? { start: from, end: to } : fallback;

	/*
	 * The tracked balance waits on today's rates, and a rate lookup can take
	 * a second when the rate source is slow or refusing. It is streamed, so
	 * the page renders on the report alone and the card fills in after.
	 */
	const balance = ledger.listWallets(token).then(async (wallets) => {
		const all = wallets.data ?? [];
		const totals = walletTotals(all, base, await ledger.walletRates(all, base, token));
		return { totals, formatted: formatMoney(totals.total, base) };
	});

	const overview = await reports.overview(range.start, range.end, token);

	return { range, overview: overview.data!, balance };
};
