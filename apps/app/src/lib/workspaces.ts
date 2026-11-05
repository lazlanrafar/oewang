/**
 * Workspaces, from the browser's side (D94): the labels a role reads as,
 * the letter a workspace tile shows, and the currencies a new workspace is
 * offered.
 */

import { t, type TranslationKey } from '$lib/i18n';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

const ROLE_KEYS: Record<WorkspaceRole, TranslationKey> = {
	owner: 'workspaces.role_owner',
	admin: 'workspaces.role_admin',
	member: 'workspaces.role_member'
};

export function roleLabel(role: string): string {
	return role in ROLE_KEYS ? t(ROLE_KEYS[role as WorkspaceRole]) : role;
}

/** The letter on a workspace's tile, as the old switcher drew it. */
export function workspaceInitial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * What a new workspace may be kept in. A list for the picker only: the API
 * checks the shape of the code, not membership of this list, so a currency
 * missing here costs a choice, never a refused write.
 */
export const WORKSPACE_CURRENCIES = [
	'IDR',
	'USD',
	'EUR',
	'SGD',
	'MYR',
	'THB',
	'PHP',
	'VND',
	'JPY',
	'KRW',
	'CNY',
	'HKD',
	'INR',
	'AUD',
	'NZD',
	'GBP',
	'CHF',
	'CAD'
];

/** Where to go back to after switching: a path on this site, never elsewhere. */
export function safeNext(value: string | null | undefined, fallback = '/overview'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
		return fallback;
	}
	return value;
}
