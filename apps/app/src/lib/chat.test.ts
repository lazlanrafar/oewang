import { describe, expect, it } from 'vitest';

import { relativeTime, toMessageItem, toSessionItem } from './chat';
import type { ChatMessage, ChatSessionSummary } from './server/chat';

const NOW = Date.parse('2026-11-03T12:00:00Z');

function session(overrides: Partial<ChatSessionSummary> = {}): ChatSessionSummary {
	return {
		id: 's1',
		title: 'Food last month',
		message_count: 4,
		last_message: 'You spent Rp 1.240.000 on Food.',
		created_at: '2026-11-01T09:00:00Z',
		updated_at: '2026-11-03T11:58:00Z',
		...overrides
	};
}

describe('relativeTime', () => {
	it('says "now" inside the first minute', () => {
		expect(relativeTime('2026-11-03T11:59:30Z', 'en-GB', NOW)).toBe('this minute');
	});

	it('counts minutes, then hours, then days', () => {
		expect(relativeTime('2026-11-03T11:40:00Z', 'en-GB', NOW)).toBe('20 minutes ago');
		expect(relativeTime('2026-11-03T09:00:00Z', 'en-GB', NOW)).toBe('3 hours ago');
		expect(relativeTime('2026-11-01T12:00:00Z', 'en-GB', NOW)).toBe('2 days ago');
	});

	it('falls back to a date past a month', () => {
		// Relative time stops being useful once it is "last month".
		expect(relativeTime('2026-08-14T12:00:00Z', 'en-GB', NOW)).toBe('14 Aug');
	});
});

describe('toSessionItem', () => {
	it('shows the newest message as the second line', () => {
		expect(toSessionItem(session(), 'en-GB', NOW)).toEqual({
			id: 's1',
			title: 'Food last month',
			when: '2 minutes ago',
			preview: 'You spent Rp 1.240.000 on Food.'
		});
	});

	it('falls back to the count when nothing has been said', () => {
		const empty = toSessionItem(session({ last_message: null, message_count: 0 }), 'en-GB', NOW);
		expect(empty.preview).toBe('No messages');
	});

	it('counts one message in the singular', () => {
		const one = toSessionItem(session({ last_message: null, message_count: 1 }), 'en-GB', NOW);
		expect(one.preview).toBe('1 message');
	});

	it('counts several', () => {
		const many = toSessionItem(session({ last_message: null, message_count: 7 }), 'en-GB', NOW);
		expect(many.preview).toBe('7 messages');
	});
});

describe('toMessageItem', () => {
	const message: ChatMessage = {
		id: 'm1',
		role: 'assistant',
		content: 'You spent Rp 1.240.000.',
		created_at: '2026-11-03T09:05:00Z',
		attachments: null
	};

	it('names the speaker through the dictionary', () => {
		expect(toMessageItem(message).who).toBe('Assistant');
		expect(toMessageItem({ ...message, role: 'user' }).who).toBe('You');
	});

	it('keeps the content untouched', () => {
		// The rendering and the sanitising happen in $lib/markdown, at the
		// point the text becomes HTML.
		expect(toMessageItem(message).content).toBe('You spent Rp 1.240.000.');
	});

	it('carries the tools and files stored on the message', () => {
		// A reloaded conversation shows the same strip the live turn did.
		const item = toMessageItem({
			...message,
			attachments: {
				tool_calls: [
					{ id: 't1', name: 'create_transaction', result: { ok: true, summary: 'Created.' } }
				],
				files: [{ vault_file_id: 'f1', name: 'receipt.jpg', type: 'image/jpeg' }]
			}
		});

		expect(item.toolCalls).toHaveLength(1);
		expect(item.toolCalls[0]).toMatchObject({ name: 'create_transaction', status: 'ok' });
		expect(item.files).toEqual([{ id: 'f1', name: 'receipt.jpg', type: 'image/jpeg' }]);
	});

	it('has no tools or files when the message carries none', () => {
		expect(toMessageItem(message)).toMatchObject({ toolCalls: [], files: [] });
	});
});
