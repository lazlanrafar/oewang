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
	NO_WORKSPACE: 'errors.no_workspace',
	LAST_OWNER: 'errors.last_owner',
	INVITE_INVALID: 'errors.invite_invalid',
	RESET_TOKEN_INVALID: 'errors.reset_token_invalid',
	VALIDATION_FAILED: 'errors.validation_failed',
	RATE_LIMITED: 'errors.rate_limited',
	NOT_FOUND: 'errors.not_found',
	WALLET_HAS_TRANSACTIONS: 'errors.wallet_has_transactions',
	WALLET_CURRENCY_LOCKED: 'errors.wallet_currency_locked',
	WORKSPACE_CURRENCY_LOCKED: 'errors.workspace_currency_locked',
	WORKSPACE_CURRENCY_CHANGED: 'errors.workspace_currency_changed',
	WALLET_NOT_FOUND: 'errors.wallet_not_found',
	CATEGORY_NOT_FOUND: 'errors.category_not_found',
	TRANSACTION_NOT_FOUND: 'errors.transaction_not_found',
	TRANSFER_REQUIRES_DESTINATION: 'errors.transfer_requires_destination',
	TRANSFER_SAME_WALLET: 'errors.transfer_same_wallet',
	DESTINATION_NOT_ALLOWED: 'errors.destination_not_allowed',
	TRANSFER_AMOUNT_REQUIRED: 'errors.transfer_amount_required',
	AMOUNT_NOT_POSITIVE: 'errors.amount_not_positive',
	FX_RATE_UNAVAILABLE: 'errors.fx_rate_unavailable',
	STREAM_FAILED: 'errors.stream_failed',
	AI_UNAVAILABLE: 'errors.ai_unavailable',
	EXTRACTION_NO_ANSWER: 'errors.extraction_no_answer',
	TELEGRAM_DISABLED: 'errors.telegram_disabled',
	RECEIPT_UNREADABLE: 'errors.receipt_unreadable'
};

export function messageForCode(code: string): string {
	const key = CODE_TO_KEY[code];
	return key ? t(key) : t('errors.unexpected');
}
