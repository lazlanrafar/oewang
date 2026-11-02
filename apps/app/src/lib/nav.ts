/**
 * The sidebar, ported from the old app's navigation/sidebar/sidebar-items.ts.
 *
 * Titles are dictionary keys, not strings (UI-1). Routes that do not exist
 * yet are marked so the shell can render them disabled rather than linking
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
			{ titleKey: 'nav.transactions', href: '/transactions', icon: Banknote, pending: true },
			{ titleKey: 'nav.chat', href: '/chat', icon: MessageSquare, pending: true }
		]
	},
	{
		items: [{ titleKey: 'nav.settings', href: '/settings', icon: Settings, pending: true }]
	}
];
