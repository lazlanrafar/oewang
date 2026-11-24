import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
import { currentMonth } from '$lib/month-range';
import * as debtsApi from '$lib/server/debts';
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
		return { totals, currency: base };
	});

	/*
	 * The debt balance card (DEBT-13): the net position the debts page shows
	 * and how many debts are open, both from the summary. It counts no
	 * overdue, so the API's own date is fine here. Streamed like the balance, and null when
	 * the read fails, so the overview never waits on it or breaks for it.
	 */
	const debts = debtsApi.debtSummary(new URLSearchParams(), token).then(
		(summary) => summary.data,
		() => null
	);

	const overview = await reports.overview(range.start, range.end, token);

	return { range, overview: overview.data!, balance, debts };
};
