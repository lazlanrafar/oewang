/**
 * The sidebar.
 *
 * Grouping mirrors the live app: an unlabelled first group, then Finance,
 * then System. The item set is ours, not the live app's: Calendar, Accounts,
 * Budget, Debts, Contacts, Vault and Apps belong to features this rewrite
 * deliberately drops (docs/prd.md#non-goals-for-v1).
 *
 * Titles are dictionary keys, not strings (UI-1). A route that does not
 * exist yet is marked so the shell renders it disabled rather than linking
 * into a 404.
 */

import { Banknote, LayoutDashboard, MessageSquare, Settings } from '@lucide/svelte';
import type { Component } from 'svelte';

import type { TranslationKey } from '$lib/i18n';

export type NavItem = {
	titleKey: TranslationKey;
	href: string;
	icon: Component;
	/** Built in a later story. Rendered, but not navigable. */
	pending?: boolean;
};

export type NavGroup = {
	labelKey?: TranslationKey;
	items: NavItem[];
};

export const navGroups: NavGroup[] = [
	{
		items: [{ titleKey: 'nav.overview', href: '/overview', icon: LayoutDashboard, pending: true }]
	},
	{
		labelKey: 'nav.finance_group',
		items: [
			{ titleKey: 'nav.transactions', href: '/transactions', icon: Banknote },
			{ titleKey: 'nav.chat', href: '/chat', icon: MessageSquare, pending: true }
		]
	},
	{
		labelKey: 'nav.system_group',
		items: [{ titleKey: 'nav.settings', href: '/settings', icon: Settings }]
	}
];
