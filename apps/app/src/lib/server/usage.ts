/**
 * What the workspace spends: stored bytes and model tokens (D92).
 *
 * Recorded and shown, never limited. Server only.
 */

import { api } from './api';

export type Tokens = { input: number; output: number };

export type WorkspaceUsage = {
	storage: { bytes: number; files: number };
	ai: {
		month: Tokens;
		total: Tokens;
		by_feature: { feature: string; month: Tokens; total: Tokens; calls: number }[];
	};
};

/** Stored bytes and AI tokens, no limit (D92, USG-3). */
export function workspaceUsage(token?: string) {
	return api<WorkspaceUsage>({ path: '/v1/workspaces/current/usage', token });
}
