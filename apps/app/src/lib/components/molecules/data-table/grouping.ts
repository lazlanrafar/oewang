/**
 * How the list divides itself into blocks.
 *
 * The live app offers four intervals and keeps the choice in the URL, so a
 * link carries the shape of the list as well as its contents (UI-8). The
 * work is here rather than in the table because it is arithmetic on date
 * strings and nothing else: no DOM, no runes, and so unit-testable.
 *
 * Every function takes the API's own `YYYY-MM-DD` day string. A day is a
 * plain date, never an instant: parsing it at local midnight is what keeps
 * a transaction on the day it was written in rather than sliding across a
 * zone boundary (TXN-4).
 */
export const GROUPINGS = ['none', 'daily', 'weekly', 'monthly'] as const;

export type Grouping = (typeof GROUPINGS)[number];

const atMidnight = (day: string) => new Date(`${day}T00:00:00`);

const iso = (date: Date) =>
	`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;

/**
 * The Monday on or before a day.
 *
 * Monday rather than Sunday because that is the week Indonesia counts, and
 * because `getDay()` returns 0 for Sunday, which is the off-by-one every
 * hand-written week calculation gets wrong.
 */
function startOfWeek(day: string): Date {
	const date = atMidnight(day);
	const weekday = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - weekday);
	return date;
}

/**
 * Which block a day belongs to.
 *
 * The key is itself a date for the weekly case rather than a week number:
 * `2026-W01` sorts wrongly across a year boundary and says nothing a reader
 * could check, while the Monday's own date does both.
 */
export function groupKey(day: string, grouping: Grouping): string {
	switch (grouping) {
		case 'none':
			return '';
		case 'weekly':
			return iso(startOfWeek(day));
		case 'monthly':
			return day.slice(0, 7);
		default:
			return day;
	}
}

/** What the block's header says. */
export function groupLabel(key: string, grouping: Grouping, locale = 'en-GB'): string {
	if (!key) return '';

	if (grouping === 'monthly') {
		const [year, month] = key.split('-');
		const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
		return formatter.format(new Date(Number(year), Number(month) - 1, 1)).toUpperCase();
	}

	if (grouping === 'weekly') {
		const start = atMidnight(key);
		const end = new Date(start);
		end.setDate(end.getDate() + 6);

		const short = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
		const full = new Intl.DateTimeFormat(locale, {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
		return `${short.format(start)} - ${full.format(end)}`.toUpperCase();
	}

	const formatter = new Intl.DateTimeFormat(locale, {
		weekday: 'long',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
	return formatter.format(atMidnight(key)).toUpperCase();
}
