/**
 * API error codes to dictionary keys.
 *
 * The web app never renders `error.message` to a user (UI-1): that field is
 * for developers, logs and agents. This table is the only bridge, so a new
 * code without a string is a typecheck failure rather than English leaking
 * into an Indonesian UI later.
 */

import { t, type TranslationKey } from '$lib/i18n';

const CODE_TO_KEY: Record<string, TranslationKey> = {
	INVALID_CREDENTIALS: 'errors.invalid_credentials',
	EMAIL_TAKEN: 'errors.email_taken',
	UNAUTHENTICATED: 'errors.unauthenticated',
	INSUFFICIENT_ROLE: 'errors.insufficient_role',
	NOT_A_MEMBER: 'errors.not_a_member',
	LAST_OWNER: 'errors.last_owner',
	INVITE_INVALID: 'errors.invite_invalid',
	RESET_TOKEN_INVALID: 'errors.reset_token_invalid',
	VALIDATION_FAILED: 'errors.validation_failed',
	RATE_LIMITED: 'errors.rate_limited',
	NOT_FOUND: 'errors.not_found'
};

export function messageForCode(code: string): string {
	const key = CODE_TO_KEY[code];
	return key ? t(key) : t('errors.unexpected');
}
