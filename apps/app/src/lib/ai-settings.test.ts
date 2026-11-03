import { describe, expect, it } from 'vitest';

import {
	INSTRUCTIONS_LIMIT,
	instructionsRemaining,
	instructionsWithinLimit,
	languageLabelKey,
	RESPONSE_LANGUAGES,
	toResponseLanguage
} from './ai-settings';
import { t } from './i18n';

describe('instructionsRemaining', () => {
	it('counts down from the limit the API enforces', () => {
		expect(instructionsRemaining('')).toBe(INSTRUCTIONS_LIMIT);
		expect(instructionsRemaining('Always answer in rupiah.')).toBe(INSTRUCTIONS_LIMIT - 24);
	});

	it('counts code points, not UTF-16 units', () => {
		// The API counts Rust `char`s. Counting the JavaScript way would
		// refuse text the API accepts, and only for the users whose text
		// leaves the basic plane.
		expect('🙂'.length).toBe(2);
		expect(instructionsRemaining('🙂')).toBe(INSTRUCTIONS_LIMIT - 1);
	});

	it('goes negative rather than stopping at zero', () => {
		// The field says how far over it is, which is what a user pasting a
		// long paragraph needs to know.
		expect(instructionsRemaining('x'.repeat(INSTRUCTIONS_LIMIT + 12))).toBe(-12);
	});
});

describe('instructionsWithinLimit', () => {
	it('allows exactly the limit and refuses one more', () => {
		expect(instructionsWithinLimit('x'.repeat(INSTRUCTIONS_LIMIT))).toBe(true);
		expect(instructionsWithinLimit('x'.repeat(INSTRUCTIONS_LIMIT + 1))).toBe(false);
	});
});

describe('toResponseLanguage', () => {
	it('keeps a value the API knows', () => {
		for (const language of RESPONSE_LANGUAGES) {
			expect(toResponseLanguage(language)).toBe(language);
		}
	});

	it('falls back to auto for anything else', () => {
		// A select with no matching option renders as its first one, which
		// would propose a change the user never made. `auto` is the API's
		// own default, so it proposes nothing.
		expect(toResponseLanguage('klingon')).toBe('auto');
		expect(toResponseLanguage(null)).toBe('auto');
		expect(toResponseLanguage(undefined)).toBe('auto');
		expect(toResponseLanguage(7)).toBe('auto');
	});
});

describe('languageLabelKey', () => {
	it('names every language through the dictionary', () => {
		for (const language of RESPONSE_LANGUAGES) {
			const label = t(languageLabelKey(language));
			expect(label).not.toBe(languageLabelKey(language));
			expect(label).not.toBe('');
		}
	});
});
