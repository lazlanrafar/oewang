/**
 * Chat sessions and messages, as the components render them.
 *
 * The formatting lives here rather than in the markup, so the list and the
 * message column stay layouts. Same split as `transaction-detail.ts`.
 */

import {
	filesFromAttachments,
	toolCallsFromAttachments,
	type MessageFile,
	type ToolCall
} from '$lib/chat-tools';
import { t, type TranslationKey } from '$lib/i18n';
import type { ChatMessage, ChatSessionSummary } from '$lib/server/chat';

export type SessionItem = {
	id: string;
	title: string;
	/** "2 minutes ago", for the list's right-hand column. */
	when: string;
	/** The second line: the newest message, or how many there are. */
	preview: string;
};

/**
 * The conversation list and its actions, as the chat layout publishes them
 * to the page whose composer opens the list (D87).
 */
export type ChatHistoryContext = {
	readonly sessions: SessionItem[];
	readonly activeId: string | null;
	onRename: (id: string, title: string) => void;
	onDelete: (id: string) => void;
};

export const CHAT_HISTORY = Symbol('chat-history');

export type MessageItem = {
	id: string;
	role: ChatMessage['role'];
	content: string;
	/** "14:32", enough beside a message in a conversation read top to bottom. */
	at: string;
	who: string;
	/** The tools this message ran, as the strip above it shows them. */
	toolCalls: ToolCall[];
	/** The files sent with it, which `#file:` links also point at. */
	files: MessageFile[];
};

/** One key per role, so the lookup is typed rather than built as a string. */
const WHO: Record<ChatMessage['role'], TranslationKey> = {
	user: 'chat.role_user',
	assistant: 'chat.role_assistant',
	system: 'chat.role_system'
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in words.
 *
 * `Intl.RelativeTimeFormat` rather than a date library: it is in every
 * runtime the app targets and it already knows the locale's plural rules.
 */
export function relativeTime(iso: string, locale = 'en-GB', now = Date.now()): string {
	const elapsed = now - new Date(iso).getTime();
	const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

	if (elapsed < MINUTE) return format.format(0, 'minute');
	if (elapsed < HOUR) return format.format(-Math.floor(elapsed / MINUTE), 'minute');
	if (elapsed < DAY) return format.format(-Math.floor(elapsed / HOUR), 'hour');
	if (elapsed < 30 * DAY) return format.format(-Math.floor(elapsed / DAY), 'day');

	return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(
		new Date(iso)
	);
}

export function toSessionItem(
	session: ChatSessionSummary,
	locale = 'en-GB',
	now = Date.now()
): SessionItem {
	return {
		id: session.id,
		title: session.title,
		when: relativeTime(session.updated_at, locale, now),
		preview: session.last_message ?? countLabel(session.message_count)
	};
}

export function toMessageItem(message: ChatMessage, locale = 'en-GB'): MessageItem {
	return {
		id: message.id,
		role: message.role,
		content: message.content,
		at: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
			new Date(message.created_at)
		),
		who: t(WHO[message.role]),
		toolCalls: toolCallsFromAttachments(message.attachments),
		files: filesFromAttachments(message.attachments)
	};
}

function countLabel(count: number): string {
	if (count === 0) return t('chat.no_messages');
	if (count === 1) return t('chat.one_message');
	return t('chat.message_count', { count });
}
