/**
 * What the console's two list screens share (US-081): the sort they start
 * on, newest first, as the API defaults, and how a date reads in a cell.
 */
import type { TableSort } from '$lib/components/molecules/data-table';
import type { TranslationKey } from '$lib/i18n';

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

export const FEEDBACK_STATUSES = ['open', 'done'] as const;
export const FEEDBACK_TYPES = ['bug', 'feature', 'other'] as const;

/**
 * The PATCH body a feedback form sends (US-083): only what the form
 * carries. A blank note clears it, as the API reads an empty string.
 */
export function feedbackPatch(form: FormData): {
	status?: (typeof FEEDBACK_STATUSES)[number];
	operator_note?: string | null;
} {
	const body: ReturnType<typeof feedbackPatch> = {};
	const status = form.get('status');
	if ((FEEDBACK_STATUSES as readonly unknown[]).includes(status)) {
		body.status = status as (typeof FEEDBACK_STATUSES)[number];
	}
	if (form.has('operator_note')) {
		body.operator_note = String(form.get('operator_note')).trim() || null;
	}
	return body;
}

/** A `YYYY-MM` from the URL, or null for anything else (the API then picks this month). */
export function readMonth(value: string | null): string | null {
	return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

/** The month `by` months from `month`, both `YYYY-MM`. */
export function shiftMonth(month: string, by: number): string {
	const [year, index] = month.split('-').map(Number);
	const shifted = new Date(Date.UTC(year, index - 1 + by, 1));
	return shifted.toISOString().slice(0, 7);
}

/** This month in UTC, the month the API counts usage in. */
export const currentMonthUtc = (now = new Date()) => now.toISOString().slice(0, 7);

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "November 2026". */
export const formatMonth = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

/** A plain `YYYY-MM-DD` as "17 Nov", read in UTC so no reader's zone moves it a day. */
export const formatShortDay = (day: string) => shortDayFormat.format(new Date(`${day}T00:00:00Z`));

/**
 * Every console permission, in the order of the permission matrix
 * (docs/features/console.md), each with its label and one-line meaning.
 */
export const CONSOLE_PERMISSIONS: { key: string; label: TranslationKey; description: TranslationKey }[] = [
	{ key: 'console.read', label: 'console.permissions.read.label', description: 'console.permissions.read.description' },
	{ key: 'console.feedback.write', label: 'console.permissions.feedback_write.label', description: 'console.permissions.feedback_write.description' },
	{ key: 'console.users.disable', label: 'console.permissions.users_disable.label', description: 'console.permissions.users_disable.description' },
	{ key: 'console.workspaces.suspend', label: 'console.permissions.workspaces_suspend.label', description: 'console.permissions.workspaces_suspend.description' },
	{ key: 'console.workspaces.restore', label: 'console.permissions.workspaces_restore.label', description: 'console.permissions.workspaces_restore.description' },
	{ key: 'console.operators.manage', label: 'console.permissions.operators_manage.label', description: 'console.permissions.operators_manage.description' },
	{ key: 'console.roles.manage', label: 'console.permissions.roles_manage.label', description: 'console.permissions.roles_manage.description' },
	{ key: 'console.audit.read', label: 'console.permissions.audit_read.label', description: 'console.permissions.audit_read.description' }
];

/** A permission's label key; null for one this build does not know, which then shows as its key. */
export const permissionLabel = (permission: string): TranslationKey | null =>
	CONSOLE_PERMISSIONS.find((entry) => entry.key === permission)?.label ?? null;

const AUDIT_ACTIONS: Record<string, TranslationKey> = {
	'workspace.suspended': 'console.audit.actions.workspace_suspended',
	'workspace.unsuspended': 'console.audit.actions.workspace_unsuspended',
	'workspace.restored': 'console.audit.actions.workspace_restored',
	'user.disabled': 'console.audit.actions.user_disabled',
	'user.enabled': 'console.audit.actions.user_enabled',
	'feedback.updated': 'console.audit.actions.feedback_updated',
	'role.created': 'console.audit.actions.role_created',
	'role.updated': 'console.audit.actions.role_updated',
	'role.deleted': 'console.audit.actions.role_deleted',
	'operator.granted': 'console.audit.actions.operator_granted',
	'operator.changed': 'console.audit.actions.operator_changed',
	'operator.revoked': 'console.audit.actions.operator_revoked'
};

/** An audit action's label key; null for one this build does not know. */
export const auditActionLabel = (action: string): TranslationKey | null => AUDIT_ACTIONS[action] ?? null;

/** Where an audited thing is shown in the console, or null when it has no screen. */
export function auditEntityHref(entity: string, id: string): string | null {
	const at = encodeURIComponent(id);
	switch (entity) {
		case 'user':
			return `/console/users?user=${at}`;
		case 'workspace':
			return `/console/workspaces?workspace=${at}`;
		case 'feedback':
			return `/console/feedback?feedback=${at}`;
		case 'console_role':
			return '/console/roles';
		default:
			return null;
	}
}

export type AuditDiffRow = { key: string; before: string; after: string; changed: boolean };

const shown = (value: unknown) =>
	value === null || value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value);

/**
 * An audit entry's before and after as one row per field, in the order the
 * fields first appear, each marked when it changed. A field only one side
 * has reads as a dash on the other.
 */
export function auditDiff(
	before: Record<string, unknown> | null,
	after: Record<string, unknown> | null
): AuditDiffRow[] {
	const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
	return keys.map((key) => {
		const was = shown(before?.[key]);
		const now = shown(after?.[key]);
		return { key, before: was, after: now, changed: was !== now };
	});
}
