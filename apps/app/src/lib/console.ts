/**
 * What the console's two list screens share (US-081): the sort they start
 * on, newest first, as the API defaults, and how a date reads in a cell.
 */
import type { TableSort } from '$lib/components/molecules/data-table';

const DEFAULT_KEY = 'created_at';

/** The sort in the URL; the default (newest first) leaves it unsaid. */
export function readSort(url: { searchParams: { get(name: string): string | null } }): TableSort {
	return {
		key: url.searchParams.get('sort') || DEFAULT_KEY,
		descending: url.searchParams.get('order') !== 'asc'
	};
}

/** The parameters a sort change writes; back on page one. */
export function sortParams(next: TableSort): Record<'sort' | 'order' | 'page', string | null> {
	const isDefault = next.key === null || (next.key === DEFAULT_KEY && next.descending);
	return {
		sort: isDefault ? null : next.key,
		order: isDefault ? null : next.descending ? 'desc' : 'asc',
		page: null
	};
}

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDay = (iso: string) => dayFormat.format(new Date(iso));

/** Counts and token totals: plain numbers, never money (D12 does not apply). */
export const formatCount = (value: number) => new Intl.NumberFormat('en-GB').format(value);

export const WORKSPACE_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

/** Deleted wins over suspended; neither is active, as the API's `status` filter reads it. */
export function workspaceStatus(workspace: {
	deleted_at: string | null;
	suspended_at: string | null;
}): WorkspaceStatus {
	if (workspace.deleted_at) return 'deleted';
	if (workspace.suspended_at) return 'suspended';
	return 'active';
}

export type WorkspaceAction = 'suspend' | 'unsuspend' | 'restore';
export type UserAction = 'disable' | 'enable';

/**
 * What a workspace's sheet offers this operator (US-082). A deleted
 * workspace can only be restored; a live one suspended or unsuspended. The
 * API checks the same permissions; hiding a button is a courtesy.
 */
export function workspaceActions(
	workspace: { deleted_at: string | null; suspended_at: string | null },
	permissions: readonly string[]
): WorkspaceAction[] {
	if (workspace.deleted_at) {
		return permissions.includes('console.workspaces.restore') ? ['restore'] : [];
	}
	if (!permissions.includes('console.workspaces.suspend')) return [];
	return [workspace.suspended_at ? 'unsuspend' : 'suspend'];
}

/** What a user's sheet offers. An operator cannot be disabled, so it is never offered. */
export function userActions(
	user: { disabled_at: string | null; console_role: string | null },
	permissions: readonly string[]
): UserAction[] {
	if (!permissions.includes('console.users.disable')) return [];
	if (user.disabled_at) return ['enable'];
	return user.console_role ? [] : ['disable'];
}
