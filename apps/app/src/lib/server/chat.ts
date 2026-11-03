/**
 * Typed calls to the chat endpoints.
 *
 * Server only, like everything under `src/lib/server`: the browser never
 * talks to the API (D5). Sessions and their messages live here, and so does
 * the turn that fills them.
 */

import { api, apiStream, type Envelope } from './api';

export type ChatSessionSummary = {
	id: string;
	title: string;
	message_count: number;
	/** One line of the newest message, for the list's second row. */
	last_message: string | null;
	created_at: string;
	updated_at: string;
};

export type ChatSession = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
};

export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
	id: string;
	role: ChatRole;
	content: string;
	/** Tool calls, files, receipt drafts. Shapes in docs/features/chat.md. */
	attachments?: Record<string, unknown> | null;
	created_at: string;
};

export type Conversation = ChatSession & { messages: ChatMessage[] };

export function listSessions(
	token?: string,
	limit = 50
): Promise<Envelope<ChatSessionSummary[]>> {
	return api<ChatSessionSummary[]>({
		path: '/v1/ai/sessions',
		query: new URLSearchParams({ limit: String(limit) }),
		token
	});
}

export function readSession(id: string, token?: string): Promise<Envelope<Conversation>> {
	return api<Conversation>({ path: `/v1/ai/sessions/${id}`, token });
}

export function createSession(title: string | null, token?: string) {
	return api<ChatSession>({
		method: 'POST',
		path: '/v1/ai/sessions',
		body: { title },
		token
	});
}

export function renameSession(id: string, title: string, token?: string) {
	return api<ChatSession>({
		method: 'PATCH',
		path: `/v1/ai/sessions/${id}`,
		body: { title },
		token
	});
}

export function deleteSession(id: string, token?: string) {
	return api<null>({ method: 'DELETE', path: `/v1/ai/sessions/${id}`, token });
}

/**
 * The workspace's agent settings (CHAT-10).
 *
 * Both fields reach every future turn's system prompt, which is why the
 * page says so and why the instructions are bounded
 * (docs/features/chat.md#settings).
 */
export type AgentSettings = {
	custom_instructions: string | null;
	response_language: ResponseLanguage;
};

export type ResponseLanguage = 'auto' | 'english' | 'indonesian';

export function readSettings(token?: string): Promise<Envelope<AgentSettings>> {
	return api<AgentSettings>({ path: '/v1/ai/settings', token });
}

/**
 * Change one or both fields. Admin and above.
 *
 * A patch: an absent key is left alone, and `custom_instructions` sent
 * empty clears it. The page always sends both, because it renders both.
 */
export function updateSettings(
	patch: Partial<Pick<AgentSettings, 'custom_instructions' | 'response_language'>>,
	token?: string
) {
	return api<AgentSettings>({ method: 'PATCH', path: '/v1/ai/settings', body: patch, token });
}

export type TurnRequest = {
	session_id: string;
	message: string;
	attachment_ids: string[];
};

/**
 * One turn (CHAT-2).
 *
 * The API persists both messages and answers with the event stream; this
 * returns it decrypted, ready to write to the browser. `signal` is the
 * browser's connection: when it goes, so does this one, and the API stops
 * generating and keeps what it has (CHAT-9).
 */
export function streamTurn(
	turn: TurnRequest,
	token?: string,
	signal?: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
	return apiStream({
		method: 'POST',
		path: '/v1/ai/chat/stream',
		body: turn,
		token,
		signal
	});
}
