/**
 * The dictionary.
 *
 * Every user-facing string resolves through here (UI-1). No literals in
 * markup, so adding a second locale later means adding a file, not auditing
 * every component.
 *
 * `TranslationKey` is generated from en.json by scripts/generate-i18n-keys.ts,
 * so an unknown key is a typecheck error rather than a string that silently
 * renders as itself.
 */

import en from './en.json';
import type { TranslationKey } from './keys';

const dictionary = en as Record<string, unknown>;

/** Resolve a dot path, for example `nav.transactions`. */
function resolve(key: string): string | undefined {
	let current: unknown = dictionary;
	for (const segment of key.split('.')) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return typeof current === 'string' ? current : undefined;
}

const plurals = new Intl.PluralRules('en');

/**
 * Look up a string, with optional `{placeholder}` substitution.
 *
 * `{count|file|files}` picks the singular or plural word by the value of
 * `count`, so "{count} {count|file|files}" reads "1 file" and "2 files". A
 * formatted value such as "1,234" counts by its digits.
 *
 * A missing key returns the key itself rather than throwing: a broken string
 * should not take a page down, and the typecheck already caught it.
 */
export function t(key: TranslationKey, values?: Record<string, string | number>): string {
	const template = resolve(key) ?? key;
	if (!values) return template;

	return template
		.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (match, name: string, one: string, other: string) =>
			name in values
				? plurals.select(Number(String(values[name]).replace(/[^\d.-]/g, ''))) === 'one'
					? one
					: other
				: match
		)
		.replace(/\{(\w+)\}/g, (match, name: string) =>
			name in values ? String(values[name]) : match
		);
}

export type { TranslationKey };
