/**
 * Formatting money without ever parsing it.
 *
 * The API sends a decimal string, and it stays a string all the way to the
 * DOM (D12). `parseFloat` is absent on purpose: 812500.0000 survives it, but
 * the first balance that does not is a silent error nobody catches, and a
 * formatter is the one place where reaching for a number feels harmless.
 *
 * So every function here works on the digits themselves.
 */

/**
 * Currencies this product renders without decimal places.
 *
 * A table rather than `Intl`, for two reasons. `Intl` depends on the ICU
 * data the runtime was built with, and a small-ICU build answers 2 for IDR,
 * which would print `Rp 812.500,00` on every row. And rupiah showing no
 * decimals is a display convention here, not an ISO 4217 fact: the minor
 * unit exists, nobody uses it, and the old app never showed it.
 */
const ZERO_DECIMAL = new Set(['IDR', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF', 'TWD']);

/** How many decimal places a currency shows. Two unless the table says otherwise. */
export function currencyDigits(code: string): number {
	return ZERO_DECIMAL.has(code.trim().toUpperCase()) ? 0 : 2;
}

type Parts = { negative: boolean; whole: string; fraction: string };

/** Split a decimal string into its parts, with no arithmetic. */
function split(value: string): Parts {
	const trimmed = value.trim();
	const negative = trimmed.startsWith('-');
	const unsigned = negative ? trimmed.slice(1) : trimmed;
	const [whole = '0', fraction = ''] = unsigned.split('.');

	return {
		negative,
		whole: whole.replace(/^0+(?=\d)/, '') || '0',
		fraction
	};
}

/**
 * Round a decimal string to `digits` places, half away from zero.
 *
 * The same rule the API rounds by, so a figure never changes when it
 * crosses the wire. Carrying is done on the digit string.
 */
export function roundDecimal(value: string, digits: number): string {
	const { negative, whole, fraction } = split(value);

	if (fraction.length <= digits) {
		return sign(negative) + whole + (digits > 0 ? '.' + fraction.padEnd(digits, '0') : '');
	}

	const kept = fraction.slice(0, digits);
	const roundUp = Number(fraction[digits]) >= 5;

	if (!roundUp) {
		return sign(negative) + whole + (digits > 0 ? '.' + kept : '');
	}

	// Add one to the last kept digit, carrying leftwards through the
	// fraction and then into the whole part.
	const carried = (BigInt(whole + kept) + 1n).toString().padStart(whole.length + digits, '0');
	const newWhole = digits > 0 ? carried.slice(0, carried.length - digits) : carried;
	const newFraction = digits > 0 ? carried.slice(carried.length - digits) : '';

	return sign(negative) + (newWhole || '0') + (digits > 0 ? '.' + newFraction : '');
}

function sign(negative: boolean): string {
	return negative ? '-' : '';
}

/** Group a run of digits in threes, with a dot, as the old app renders it. */
function group(digits: string): string {
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export type FormatOptions = {
	/** Prefix a `+` on a positive figure, so colour is never the only carrier (UI-7). */
	signed?: boolean;
	/** Render the code or symbol in front of the figure. */
	withSymbol?: boolean;
};

/** `Rp` for rupiah, `$` for dollars, the code itself for anything else. */
export function currencySymbol(code: string): string {
	switch (code.toUpperCase()) {
		case 'IDR':
			return 'Rp';
		case 'USD':
			return '$';
		case 'EUR':
			return '€';
		case 'GBP':
			return '£';
		case 'SGD':
			return 'S$';
		case 'JPY':
			return '¥';
		default:
			return code.toUpperCase();
	}
}

/**
 * A decimal string as a figure in one currency.
 *
 * The precision is the currency's own, so an IDR balance never renders two
 * meaningless zeroes and a USD balance never loses its cents.
 */
export function formatMoney(
	value: string,
	currency: string,
	options: FormatOptions = {}
): string {
	const digits = currencyDigits(currency);
	const rounded = roundDecimal(value, digits);
	const { negative, whole, fraction } = split(rounded);

	const body = group(whole) + (digits > 0 ? ',' + fraction.padEnd(digits, '0') : '');
	const marker = negative ? '-' : options.signed ? '+' : '';
	const symbol = options.withSymbol === false ? '' : currencySymbol(currency) + ' ';

	return marker + symbol + body;
}

/** Is this decimal string zero, without parsing it? */
export function isZero(value: string): boolean {
	return /^-?0*(\.0*)?$/.test(value.trim());
}

/** Is it negative? A leading minus, and not negative zero. */
export function isNegative(value: string): boolean {
	return value.trim().startsWith('-') && !isZero(value);
}

/**
 * Add decimal strings, exactly.
 *
 * Used for the per-day totals the table renders. `BigInt` on the scaled
 * digits rather than floating point, because a column of rupiah adds up to
 * a number that does not survive a double.
 */
export function addDecimals(values: string[], digits = 4): string {
	let total = 0n;

	for (const value of values) {
		const { negative, whole, fraction } = split(roundDecimal(value, digits));
		const scaled = BigInt(whole + fraction.padEnd(digits, '0'));
		total += negative ? -scaled : scaled;
	}

	const negative = total < 0n;
	const text = (negative ? -total : total).toString().padStart(digits + 1, '0');
	const whole = digits > 0 ? text.slice(0, text.length - digits) : text;
	const fraction = digits > 0 ? text.slice(text.length - digits) : '';

	return sign(negative) + whole + (digits > 0 ? '.' + fraction : '');
}

/**
 * Multiply two decimal strings exactly.
 *
 * Needed in one place only: a wallet group's total, which sums balances
 * held in different currencies and so has to convert them. Transaction
 * totals never come through here, because every row stored `base_amount`
 * at write time (TXN-19).
 */
export function multiplyDecimals(value: string, factor: string, digits = 4): string {
	const left = scaled(value);
	const right = scaled(factor);
	const product = left.units * right.units;
	const scale = left.scale + right.scale;

	const negative = product < 0n;
	const text = (negative ? -product : product).toString().padStart(scale + 1, '0');
	const whole = scale > 0 ? text.slice(0, text.length - scale) : text;
	const fraction = scale > 0 ? text.slice(text.length - scale) : '';

	return roundDecimal(sign(negative) + (whole || '0') + (fraction ? '.' + fraction : ''), digits);
}

/** A decimal string as an integer and the power of ten it was scaled by. */
function scaled(value: string): { units: bigint; scale: number } {
	const { negative, whole, fraction } = split(value);
	const units = BigInt(whole + fraction);
	return { units: negative ? -units : units, scale: fraction.length };
}

/**
 * Compare two decimal strings. Negative, zero or positive, like a sort
 * comparator wants, and exact at any magnitude.
 */
export function compareDecimals(left: string, right: string, digits = 4): number {
	const difference = addDecimals([left, negate(right)], digits);
	if (isZero(difference)) return 0;
	return isNegative(difference) ? -1 : 1;
}

/** The absolute value of a decimal string. */
export function absDecimal(value: string): string {
	const trimmed = value.trim();
	return trimmed.startsWith('-') ? trimmed.slice(1) : trimmed;
}

/** Negate a decimal string. */
export function negate(value: string): string {
	const trimmed = value.trim();
	if (isZero(trimmed)) return trimmed;
	return trimmed.startsWith('-') ? trimmed.slice(1) : '-' + trimmed;
}

/**
 * What a transaction does to the figure the list shows.
 *
 * An expense reads negative and an income positive, which is the sign the
 * table colours on. A transfer reads as leaving the wallet it is listed
 * under, so the same row is negative under the source and positive under
 * the destination.
 */
export function signedAmount(
	type: 'income' | 'expense' | 'transfer',
	amount: string
): string {
	return type === 'income' ? amount : negate(amount);
}
