/**
 * The apps the Apps page lists (D83).
 *
 * One today. The shape is the old app's integration config cut to what the
 * page renders: titles and copy are dictionary keys (UI-1), and whether an
 * app is connected comes from the API, never from here.
 *
 * Other integrations stay a non-goal (docs/prd.md#non-goals-for-v1), so
 * this list is not a registry waiting to be filled; it is the one row the
 * page needs.
 */

import type { TranslationKey } from '$lib/i18n';

export type AppId = 'telegram';

export type AppDefinition = {
	id: AppId;
	nameKey: TranslationKey;
	shortKey: TranslationKey;
	categoryKey: TranslationKey;
	/** "How it works", one paragraph per key. */
	howKeys: TranslationKey[];
};

export const APPS: AppDefinition[] = [
	{
		id: 'telegram',
		nameKey: 'apps.telegram_name',
		shortKey: 'apps.telegram_short',
		categoryKey: 'apps.category_capture',
		howKeys: ['apps.telegram_how_connect', 'apps.telegram_how_receipts', 'apps.telegram_how_chat', 'apps.telegram_how_privacy']
	}
];
