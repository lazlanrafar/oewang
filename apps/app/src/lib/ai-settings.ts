/**
 * The two agent settings, as the settings page handles them (CHAT-10).
 *
 * Small rules, kept out of the markup so they can be checked without a
 * browser: how many characters are left, and what a response language is
 * when the value came from somewhere this app does not control.
 */

import type { TranslationKey } from '$lib/i18n';
import type { ResponseLanguage } from '$lib/server/chat';

/**
 * The bound the API enforces (CHAT-10).
 *
 * It exists because the text is prepended to every turn's system prompt:
 * an unbounded field is an unbounded cost per turn, charged forever rather
 * than once. The page counts down to it so the server is not the first
 * thing that says no.
 */
export const INSTRUCTIONS_LIMIT = 2000;

/**
 * How many characters are left, counted the way the API counts them.
 *
 * Code points, not UTF-16 units: `"🙂".length` is 2 in JavaScript and 1 to
 * a Rust `chars().count()`. Counting the JavaScript way would refuse text
 * the API accepts, and would do it only for the users whose language or
 * emoji leave the basic plane.
 */
export function instructionsRemaining(text: string, limit = INSTRUCTIONS_LIMIT): number {
	return limit - [...text].length;
}

/** Whether the text is short enough for the API to take. */
export function instructionsWithinLimit(text: string, limit = INSTRUCTIONS_LIMIT): boolean {
	return instructionsRemaining(text, limit) >= 0;
}

export const RESPONSE_LANGUAGES: readonly ResponseLanguage[] = ['auto', 'english', 'indonesian'];

const LANGUAGE_LABELS: Record<ResponseLanguage, TranslationKey> = {
	auto: 'settings.language_auto',
	english: 'settings.language_english',
	indonesian: 'settings.language_indonesian'
};

/**
 * Read a language that arrived as loose text.
 *
 * The stored value is whatever an older build, a direct API call or a
 * future option put there, and a `<select>` with no matching option
 * renders as its first one, which would silently propose a change the user
 * did not make. `auto` is the API's own default, so falling back to it
 * proposes nothing.
 */
export function toResponseLanguage(value: unknown): ResponseLanguage {
	return RESPONSE_LANGUAGES.includes(value as ResponseLanguage)
		? (value as ResponseLanguage)
		: 'auto';
}

/** The dictionary key naming one language (UI-1). */
export function languageLabelKey(language: ResponseLanguage): TranslationKey {
	return LANGUAGE_LABELS[language];
}
