/**
 * The colours income and expense are drawn in, per user (UI-12, D100).
 *
 * Stored as `#rrggbb` or null for the product's default, which is the
 * `--green` and `--red` tokens in app.css. A chosen colour overrides the
 * Tailwind colour those tokens feed, `--color-green` and `--color-red`, so
 * every `text-green` and `text-red` in the app follows without a change at
 * the call site.
 *
 * The value is written into a style attribute, so it is checked here as
 * well as by the API: only six hex digits ever get through.
 */

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: string | null | undefined): value is string {
	return typeof value === 'string' && HEX.test(value);
}

/** The swatches the settings page offers before the free colour input. */
export const INCOME_PRESETS = ['#10bc99', '#16a34a', '#0ea5e9', '#2563eb', '#7c3aed'] as const;
export const EXPENSE_PRESETS = ['#ef4444', '#f97316', '#db2777', '#a16207', '#525252'] as const;

export type UserColors = { income_color: string | null; expense_color: string | null };

/**
 * The declarations that apply a user's colours, or an empty string when
 * both are the default. Each value is re-checked before it is written.
 */
export function colorStyle(colors: UserColors): string {
	const parts: string[] = [];
	if (isHexColor(colors.income_color)) parts.push(`--color-green: ${colors.income_color}`);
	if (isHexColor(colors.expense_color)) parts.push(`--color-red: ${colors.expense_color}`);
	return parts.join('; ');
}

/**
 * Apply the colours to the document root, so that sheets, menus and
 * toasts, which are portals outside the shell's own element, follow too.
 * Returns the function that takes them off again.
 */
export function applyColors(colors: UserColors): () => void {
	const root = document.documentElement.style;
	const set = (name: string, value: string | null) =>
		isHexColor(value) ? root.setProperty(name, value) : root.removeProperty(name);

	set('--color-green', colors.income_color);
	set('--color-red', colors.expense_color);

	return () => {
		root.removeProperty('--color-green');
		root.removeProperty('--color-red');
	};
}

/**
 * A category's square is its type's colour: income in the income colour,
 * expense in the expense colour, so it follows the user's choice above
 * (D100). Categories carry no colour of their own. Unknown type: grey.
 */
export function categoryColorClass(type: string | null | undefined): string {
	return type === 'income' ? 'bg-green' : type === 'expense' ? 'bg-red' : 'bg-subtle';
}
