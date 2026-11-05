/**
 * The month a list opens on.
 *
 * The live app defaults its transactions range to the current month rather
 * than to everything, so arriving at the page is a bounded question with a
 * bounded answer. The default lives here, in one function, because two
 * places need the same answer and they must not drift: the server builds the
 * query the API is asked, and the browser fills the date picker so the
 * reader can see which month they are looking at.
 *
 * A day is a plain date, never an instant. `2026-11-01` means that day
 * wherever the reader is, which is why these are strings in the API's own
 * `YYYY-MM-DD` shape rather than anything carrying a zone (TXN-4).
 */
export type DayRange = { start: string; end: string };

const pad = (value: number) => String(value).padStart(2, '0');

const day = (year: number, month: number, date: number) =>
	`${year}-${pad(month)}-${pad(date)}`;

/**
 * The first and last day of the month `today` falls in.
 *
 * `new Date(year, month, 0)` is the last day of the previous month, which is
 * how the length of a month is read without a table of lengths and without a
 * leap-year rule.
 */
export function currentMonth(today = new Date()): DayRange {
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const last = new Date(year, month, 0).getDate();
	return { start: day(year, month, 1), end: day(year, month, last) };
}

/**
 * The last `count` months up to and including the one `today` falls in,
 * whole months at both ends.
 *
 * The overview's default (D87): a year of bars reads as a trend, and a range
 * that starts mid-month draws its first bar short for no reason anyone can
 * see. Here for the same reason `currentMonth` is: the load asks the API for
 * it and the picker shows it, and the two must not drift.
 */
export function lastMonths(count: number, today = new Date()): DayRange {
	const end = currentMonth(today).end;
	const first = new Date(today.getFullYear(), today.getMonth() - (count - 1), 1);
	return { start: day(first.getFullYear(), first.getMonth() + 1, 1), end };
}
