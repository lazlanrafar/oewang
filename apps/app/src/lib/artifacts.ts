/**
 * Canvas artifacts: the analysis panels a chat answer opens (D88).
 *
 * The API builds each payload from the database and sends it on the stream
 * itself; the model never writes one, and the AI service never carries one.
 * So the shapes are the report types in `$lib/reports`, and this module only
 * has to decide what an artifact is and find the ones a conversation holds.
 */

import type { BurnRate, IncomeSummary, SpendingAnalysis } from '$lib/reports';

export const ARTIFACT_KINDS = ['spending', 'income', 'burn-rate'] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export type ArtifactPayloads = {
	spending: SpendingAnalysis;
	income: IncomeSummary;
	'burn-rate': BurnRate;
};

export type Artifact = {
	[K in ArtifactKind]: { kind: K; payload: ArtifactPayloads[K] };
}[ArtifactKind];

/** One artifact in a conversation, keyed by the tool call that made it. */
export type ArtifactEntry = Artifact & { id: string };

export function isArtifactKind(value: unknown): value is ArtifactKind {
	return ARTIFACT_KINDS.includes(value as ArtifactKind);
}

/**
 * An artifact from loose JSON: the stream frame or the stored attachment.
 *
 * A kind this app does not know is dropped rather than drawn as an empty
 * panel; the payload is the API's own and is otherwise trusted to be its
 * shape, as every other API response is.
 */
export function readArtifact(type: unknown, payload: unknown): Artifact | null {
	if (!isArtifactKind(type)) return null;
	if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;

	return { kind: type, payload } as Artifact;
}

/**
 * Every artifact in a conversation, oldest first.
 *
 * Read from the tool calls, because that is where the API stores them: one
 * per analysis call that had something to draw.
 */
export function artifactsOf(
	messages: { toolCalls: { id: string; artifact?: Artifact | null }[] }[]
): ArtifactEntry[] {
	const entries: ArtifactEntry[] = [];
	const seen = new Set<string>();

	for (const message of messages) {
		for (const call of message.toolCalls) {
			// Once per call. A conversation can briefly hold the live copy of
			// an answer beside the stored one, and a tab per copy would be
			// two tabs with one key.
			if (!call.artifact || seen.has(call.id)) continue;
			seen.add(call.id);
			entries.push({ ...call.artifact, id: call.id } as ArtifactEntry);
		}
	}

	return entries;
}
