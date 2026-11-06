/**
 * The sidebar.
 *
 * Grouping mirrors the live app: an unlabelled first group, then Finance,
 * then Workspace, then System. The item set is ours, not the live app's:
 * Calendar, Debts and Contacts belong to features this rewrite deliberately
 * drops (docs/prd.md#non-goals-for-v1). Budget came back on request (D103),
 * in its old place under Finance, after Accounts, with its piggy bank. Accounts is not among
 * them and never was: wallets are specified in their own right as WAL-1 to
 * WAL-6. Apps came back with Telegram (D83), and Vault came back on request
 * (D90), both in the live app's Workspace group, Vault first with its old
 * box icon.
 *
 * Database sits last, below Settings: the daily rate snapshot (D96) and
 * every line item ever bought (ITM-1), tables that are looked things up
 * in rather than worked in.
 *
 * Titles are dictionary keys, not strings (UI-1). A route that does not
 * exist yet is marked so the shell renders it disabled rather than linking
 * into a 404.
 */

import {
	Banknote,
	Bot,
	ArrowLeftRight,
	Box,
	ChartColumn,
	Landmark,
	PiggyBank,
	LayoutDashboard,
	Lock,
	MessageSquareWarning,
	Palette,
	Settings,
	ShoppingBasket,
	SquareDot,
	TrendingDown,
	User,
	Users,
	Wallet
} from '@lucide/svelte';
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
		items: [{ titleKey: 'nav.overview', href: '/overview', icon: LayoutDashboard }]
	},
	{
		labelKey: 'nav.finance_group',
		items: [
			{ titleKey: 'nav.transactions', href: '/transactions', icon: Banknote },
			{ titleKey: 'nav.accounts', href: '/accounts', icon: Landmark },
			{ titleKey: 'nav.budget', href: '/budget', icon: PiggyBank }
		]
	},
	{
		labelKey: 'nav.workspace_group',
		items: [
			{ titleKey: 'nav.vault', href: '/vault', icon: Box },
			{ titleKey: 'nav.apps', href: '/apps', icon: SquareDot }
		]
	},
	{
		labelKey: 'nav.system_group',
		items: [{ titleKey: 'nav.settings', href: '/settings', icon: Settings }]
	},
	{
		labelKey: 'nav.database_group',
		items: [
			{ titleKey: 'nav.rates', href: '/database/rates', icon: ArrowLeftRight },
			{ titleKey: 'nav.items', href: '/database/items', icon: ShoppingBasket }
		]
	}
];

/**
 * The account area's sidebar (D94): what a person changes about
 * themselves, outside any workspace, so outside the app shell. Profile moved
 * here from the settings sidebar, where it sat as a "Soon" row.
 */
export const accountNavGroups: NavGroup[] = [
	{
		items: [
			{ titleKey: 'account.nav_profile', href: '/account/profile', icon: User },
			{ titleKey: 'account.nav_security', href: '/account/security', icon: Lock }
		]
	}
];

/**
 * The settings sidebar (D82, D104).
 *
 * The old app's list, in its order, so the page reads as the one users
 * know, less what was never real. Display, Transaction, Backup and Passcode
 * are not listed: the old app had them as placeholders, or stored settings
 * nothing read, and a row that promises "Soon" for something nobody plans
 * to build is a broken promise (D104). Sections that belong to a non-goal
 * are not listed either: notifications and alarm, billing, and language (a
 * second UI locale) (docs/prd.md#non-goals-for-v1). The old budget section
 * is not listed: budgets are managed on their own page (D103), and one
 * thing managed from two screens is two rules to keep.
 *
 * Assistant is ours, not the old app's: it was a tab on the settings page
 * (US-032) and is a section now. `pending` stays on the type for the next
 * section that is planned but not built.
 */
export const settingsNavGroups: NavGroup[] = [
	{
		items: [
			{ titleKey: 'settings.nav_members', href: '/settings/members', icon: Users },
			{ titleKey: 'settings.nav_appearance', href: '/settings/appearance', icon: Palette }
		]
	},
	{
		labelKey: 'settings.group_categories',
		items: [
			{ titleKey: 'settings.nav_income_category', href: '/settings/income-category', icon: Wallet },
			{ titleKey: 'settings.nav_expense_category', href: '/settings/expense-category', icon: TrendingDown }
		]
	},
	{
		labelKey: 'settings.group_general',
		items: [
			{ titleKey: 'settings.nav_currency', href: '/settings/currency', icon: Banknote },
			{ titleKey: 'settings.nav_assistant', href: '/settings/assistant', icon: Bot },
			{ titleKey: 'settings.nav_usage', href: '/settings/usage', icon: ChartColumn },
			{ titleKey: 'settings.nav_feedback', href: '/settings/feedback', icon: MessageSquareWarning }
		]
	}
];
