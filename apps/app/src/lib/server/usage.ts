/**
 * What the workspace spends: stored bytes and model tokens (D92), and the
 * plan that limits them (D128). Server only.
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
	/** Null limits are unlimited (PLN-7). */
	plan: {
		id: string;
		name: string;
		max_tokens_month: number | null;
		max_storage_bytes: number | null;
	};
};

/** Stored bytes, AI tokens and the plan's limits (USG-3, PLN-7). */
export function workspaceUsage(token?: string) {
	return api<WorkspaceUsage>({ path: '/v1/workspaces/current/usage', token });
}
