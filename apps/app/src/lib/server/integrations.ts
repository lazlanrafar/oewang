/**
 * Typed calls to the `/v1/integrations` endpoints.
 *
 * Server only, like everything under `src/lib/server` (D5). Each call acts
 * on the signed-in member's own link in the session's workspace; nothing
 * here names another member (AUTH-4).
 */

import { api } from './api';

export type TelegramStatus = {
	/** False when the server runs without a bot. */
	enabled: boolean;
	bot_username: string | null;
	linked: boolean;
	telegram_username: string | null;
	linked_at: string | null;
};

export type TelegramLink = {
	/** Carries a one-time token. Shown to the member, never put in an app URL. */
	deep_link: string;
	expires_at: string;
};

export function telegramStatus(token?: string) {
	return api<TelegramStatus>({ path: '/v1/integrations/telegram', token });
}

export function telegramLink(token?: string) {
	return api<TelegramLink>({ method: 'POST', path: '/v1/integrations/telegram/link-token', token });
}

export function telegramUnlink(token?: string) {
	return api<null>({ method: 'POST', path: '/v1/integrations/telegram/unlink', token });
}
