/**
 * API error codes to dictionary keys.
 *
 * The web app never renders `error.message` to a user (UI-1): that field is
 * for developers, logs and agents. This table is the only bridge, so a new
 * code without a string is a typecheck failure rather than English leaking
 * into an Indonesian UI later.
 */

import { toast } from 'svelte-sonner';

import { t, type TranslationKey } from '$lib/i18n';

const CODE_TO_KEY: Record<string, TranslationKey> = {
	INVALID_CREDENTIALS: 'errors.invalid_credentials',
	EMAIL_TAKEN: 'errors.email_taken',
	UNAUTHENTICATED: 'errors.unauthenticated',
	INSUFFICIENT_ROLE: 'errors.insufficient_role',
	CONSOLE_FORBIDDEN: 'errors.console_forbidden',
	USER_DISABLED: 'errors.user_disabled',
	WORKSPACE_SUSPENDED: 'errors.workspace_suspended',
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
	RECEIPT_UNREADABLE: 'errors.receipt_unreadable',
	SPREADSHEET_UNREADABLE: 'errors.spreadsheet_unreadable',
	WORKSPACE_ID_NOT_ALLOWED: 'errors.workspace_id_not_allowed',
	SPREADSHEET_TOO_LARGE: 'errors.spreadsheet_too_large',
	CONTACT_NOT_FOUND: 'errors.contact_not_found',
	CONTACT_HAS_DEBTS: 'errors.contact_has_debts',
	CONTACT_MERGE_SELF: 'errors.contact_merge_self',
	DEBT_NOT_FOUND: 'errors.debt_not_found',
	PAYMENT_NOT_FOUND: 'errors.payment_not_found',
	DEBT_HAS_PAYMENTS: 'errors.debt_has_payments',
	AMOUNT_BELOW_PAID: 'errors.amount_below_paid',
	PAYMENT_EXCEEDS_REMAINING: 'errors.payment_exceeds_remaining',
	BULK_PAY_CURRENCY_MISMATCH: 'errors.bulk_pay_currency_mismatch',
	SPLIT_SOURCE_NOT_EXPENSE: 'errors.split_source_not_expense',
	PAYMENT_TRANSACTION_LOCKED: 'errors.payment_transaction_locked'
};

export function messageForCode(code: string): string {
	const key = CODE_TO_KEY[code];
	return key ? t(key) : t('errors.unexpected');
}

/**
 * Say a refusal in a toast, and report whether the result was one.
 *
 * An action started in a sheet or a dialog would otherwise land in the
 * page's banner, behind the overlay, where nobody reads it. A refusal with
 * field errors is left to the form, which shows them beside its fields.
 */
export function toastRefusal(result: {
	type: string;
	data?: { code?: unknown; fields?: unknown };
}): boolean {
	if (result.type !== 'failure' || result.data?.fields) return false;
	toast.error(messageForCode(String(result.data?.code ?? '')));
	return true;
}
