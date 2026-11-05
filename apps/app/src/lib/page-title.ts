import { t } from '$lib/i18n';

/**
 * A document title in the old app's shape: `Transactions | Settings | Oewang`.
 *
 * The parts run from the most specific to the least, joined the way the
 * old app's `title.template` (`%s | Oewang`) joined them, so a tab bar of
 * Oewang pages reads the same as it always did. With no parts it is the
 * default, "Oewang - Financial OS".
 */
export function pageTitle(...parts: string[]): string {
	const named = parts.map((part) => part.trim()).filter(Boolean);
	return named.length === 0
		? t('app.title_default')
		: t('app.page_title', { page: named.join(' | ') });
}
