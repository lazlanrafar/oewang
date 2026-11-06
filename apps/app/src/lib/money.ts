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

/**
 * The ISO code, which is what this product shows in front of a figure.
 *
 * Not a symbol. A workspace can hold wallets in several currencies, and
 * symbols are ambiguous across them: `$` is four different currencies and
 * `Rp` is one nobody outside Indonesia reads at a glance. The code is
 * unambiguous, it is the same width for every currency so a column of
 * figures stays aligned, and it is what the live app prints.
 */
export function currencySymbol(code: string): string {
	return code.trim().toUpperCase();
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

/**
 * An exchange rate, as a figure with no currency of its own.
 *
 * A rate is not money: `18181.81818182` IDR per USD wants four places at
 * most, while `0.00005518` USD per IDR is all fraction and loses its
 * meaning at four. So a rate of one or more keeps four places and a rate
 * below one keeps the eight the API stores, and trailing zeroes go either
 * way. Decimal strings throughout (D12).
 */
export function formatRate(value: string): string {
	const { whole } = split(value);
	const rounded = roundDecimal(value, whole === '0' ? 8 : 4);
	const { negative, whole: digits, fraction } = split(rounded);
	const trimmed = fraction.replace(/0+$/, '');

	return sign(negative) + group(digits) + (trimmed ? ',' + trimmed : '');
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

/**
 * Divide two decimal strings, rounded half away from zero to `digits`
 * places.
 *
 * Needed for one thing: a cross rate in the transaction form, when neither
 * the entry currency nor the wallet's is the workspace's and both are known
 * only against it (FX-2). The figure is a prefill the user may change; the
 * API stores what is sent (D39).
 */
export function divideDecimals(numerator: string, denominator: string, digits = 8): string {
	const top = scaled(numerator);
	const bottom = scaled(denominator);
	if (bottom.units === 0n) throw new RangeError('division by zero');

	// Bring both to one scale, then shift the numerator by `digits` more so
	// the integer quotient carries that many places.
	const shift = 10n ** BigInt(bottom.scale);
	const a = top.units * shift * 10n ** BigInt(digits);
	const b = bottom.units * 10n ** BigInt(top.scale);

	const negative = a < 0n !== b < 0n;
	const absA = a < 0n ? -a : a;
	const absB = b < 0n ? -b : b;
	const quotient = (2n * absA + absB) / (2n * absB);

	const text = quotient.toString().padStart(digits + 1, '0');
	const whole = digits > 0 ? text.slice(0, text.length - digits) : text;
	const fraction = digits > 0 ? text.slice(text.length - digits) : '';

	return sign(negative && quotient !== 0n) + whole + (digits > 0 ? '.' + fraction : '');
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

/**
 * A decimal string as a height on a chart. Geometry only.
 *
 * The one place an amount becomes a JavaScript number, and the reason it is
 * allowed (D89): a pixel position is a float whatever the input, and a bar
 * a fraction of a pixel off is invisible. The number is never shown, summed
 * or compared; every label beside the bar is the API's formatted string.
 * An amount that does not parse draws as zero rather than as `NaN`, which
 * would remove the whole series.
 */
export function chartValue(value: string): number {
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : 0;
}
