/**
 * Tool calls, as the conversation shows them (CHAT-14).
 *
 * Tool calls are progress, not output. They never render as JSON, and the
 * model's own words for them are never trusted to be readable, so every
 * name resolves to a label here (docs/features/chat.md#tool-call-presentation).
 *
 * Two parts, both pure so they are tested without a browser: the label,
 * with a fallback that derives one from the name shape, and the
 * presentation rule that decides between a shimmer, a check and
 * "Used 4 tools".
 */

import { readArtifact, type Artifact } from '$lib/artifacts';
import { t, type TranslationKey } from '$lib/i18n';
import { rangeLabel } from '$lib/reports';

export type ToolStatus = 'running' | 'ok' | 'failed';

export type ToolCall = {
	id: string;
	name: string;
	args: Record<string, unknown>;
	status: ToolStatus;
	/** The API's one line about what it did. Null until the call answers. */
	summary: string | null;
	/**
	 * The canvas an analysis call left, if it had something to draw (D88).
	 * Absent on every other tool.
	 */
	artifact?: Artifact | null;
};

/**
 * The fifteen tools (D17, D88, D103), each with a written label.
 *
 * Written rather than derived, because "Calculating summary" is not what
 * the name shape would produce and a progress line is read at a glance.
 */
const LABEL_KEYS: Record<string, TranslationKey> = {
	get_workspace_context: 'chat.tool_get_workspace_context',
	get_recent_transactions: 'chat.tool_get_recent_transactions',
	search_transactions: 'chat.tool_search_transactions',
	get_spending_summary: 'chat.tool_get_spending_summary',
	get_spending_analysis: 'chat.tool_get_spending_analysis',
	get_income_summary: 'chat.tool_get_income_summary',
	get_burn_rate: 'chat.tool_get_burn_rate',
	get_budget_status: 'chat.tool_get_budget_status',
	create_transaction: 'chat.tool_create_transaction',
	update_transaction: 'chat.tool_update_transaction',
	delete_transaction: 'chat.tool_delete_transaction',
	add_transaction_items: 'chat.tool_add_transaction_items',
	create_wallet: 'chat.tool_create_wallet',
	create_category: 'chat.tool_create_category',
	present_choices: 'chat.tool_present_choices'
};

const DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * What a call is about, from its arguments, for the live activity line:
 * the date range it covers, or the words it searched for.
 *
 * Only shapes this app can read are shown, and only as plain text. Anything
 * else stays out, which is why the arguments are never printed whole.
 */
export function toolDetail(call: Pick<ToolCall, 'args'>): string | null {
	const { from, to, query } = call.args;

	if (typeof from === 'string' && typeof to === 'string' && DAY.test(from) && DAY.test(to)) {
		return rangeLabel(from.slice(0, 10), to.slice(0, 10));
	}
	if (typeof query === 'string' && query.trim() !== '') {
		const words = query.trim();
		return `“${words.length > 40 ? `${words.slice(0, 39)}…` : words}”`;
	}
	return null;
}

/** The label for a tool, written or derived. */
export function toolLabel(name: string): string {
	const key = LABEL_KEYS[name];
	return key ? t(key) : deriveToolLabel(name);
}

/**
 * A label from the name shape, for a tool nobody has labelled yet.
 *
 * `verb_noun` becomes a gerund plus its noun: `archive_wallet` reads as
 * "Archiving wallet". A tool added on the service side therefore shows as
 * progress rather than as `archive_wallet` the moment it streams, which is
 * the point: the label table is an improvement on this, not a requirement
 * for a new tool to be legible.
 */
export function deriveToolLabel(name: string): string {
	const words = name
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

	if (words.length === 0) return t('chat.tool_working');

	const [verb, ...rest] = words;
	const label = [gerund(verb), ...rest].join(' ');

	return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * English gerunds, the three rules that cover a tool name.
 *
 * Deliberately not a conjugation library: the input is an identifier a
 * developer chose, not prose, and a wrong gerund on an unlabelled tool is a
 * cosmetic miss until someone writes its label.
 */
function gerund(word: string): string {
	if (word.endsWith('ie')) return `${word.slice(0, -2)}ying`;
	if (word.endsWith('ee')) return `${word}ing`;
	if (word.endsWith('e')) return `${word.slice(0, -1)}ing`;

	// A one-syllable consonant-vowel-consonant word doubles: `get` becomes
	// getting, while `add` (two consonants) and `visit` (two syllables) do
	// not. The leading class is anchored, so only a single-vowel word matches.
	if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(word)) return `${word}${word.slice(-1)}ing`;

	return `${word}ing`;
}

export type ToolPresentation = {
	/** The call in flight, whose label shimmers. */
	running: ToolCall | null;
	/** Every call that has answered, in the order the model made them. */
	finished: ToolCall[];
	/** The single line shown when nothing is expanded. */
	headline: string;
	/** Several finished calls hide behind the headline until asked for. */
	collapsible: boolean;
};

/**
 * What the tool strip shows for one message.
 *
 * One finished call is a check and its label; several collapse to
 * "Used 4 tools"; a call in flight takes the line for itself, because what
 * is happening now is more informative than what has already happened.
 */
export function presentToolCalls(calls: ToolCall[]): ToolPresentation | null {
	if (calls.length === 0) return null;

	const running = calls.find((call) => call.status === 'running') ?? null;
	const finished = calls.filter((call) => call.status !== 'running');

	const headline = running
		? toolLabel(running.name)
		: finished.length === 1
			? toolLabel(finished[0].name)
			: t('chat.tools_used', { count: finished.length });

	return { running, finished, headline, collapsible: running === null && finished.length > 1 };
}

/**
 * The tool calls stored on a message, read back.
 *
 * `ai_messages.attachments` is loose JSON on the wire
 * (docs/features/chat.md#message-attachments), so every field is checked
 * here rather than asserted with a cast. A reloaded conversation shows the
 * same strip the live turn did.
 */
export function toolCallsFromAttachments(attachments: unknown): ToolCall[] {
	const raw = record(attachments)?.tool_calls;
	if (!Array.isArray(raw)) return [];

	const calls: ToolCall[] = [];

	for (const entry of raw) {
		const call = record(entry);
		const id = string(call?.id);
		const name = string(call?.name);
		if (id === '' || name === '') continue;

		const result = record(call?.result);
		const artifact = record(call?.artifact);

		calls.push({
			id,
			name,
			args: record(call?.args) ?? {},
			// A stored call without a result never answered: the turn ended
			// first. It stays as it was rather than being reported as done.
			status: result === null ? 'running' : result.ok === true ? 'ok' : 'failed',
			summary: result === null ? null : string(result.summary) || null,
			artifact: artifact === null ? null : readArtifact(artifact.type, artifact.payload)
		});
	}

	return calls;
}

export type MessageFile = { id: string; name: string; type: string };

/** The files stored on a message, read back with the same care. */
export function filesFromAttachments(attachments: unknown): MessageFile[] {
	const raw = record(attachments)?.files;
	if (!Array.isArray(raw)) return [];

	const files: MessageFile[] = [];

	for (const entry of raw) {
		const file = record(entry);
		const id = string(file?.vault_file_id);
		if (id === '') continue;

		files.push({ id, name: string(file?.name) || id, type: string(file?.type) });
	}

	return files;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function string(value: unknown): string {
	return typeof value === 'string' ? value : '';
}
