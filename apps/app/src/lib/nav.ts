/**
 * The sidebar.
 *
 * Grouping mirrors the live app: an unlabelled first group, then Finance,
 * then Workspace, then System. The item set is ours, not the live app's:
 * Calendar belongs to a feature this rewrite deliberately drops
 * (docs/prd.md#non-goals-for-v1). Budget came back on request (D103),
 * in its old place under Finance, after Accounts, with its piggy bank.
 * Debts and Contacts came back with D120, in their old places: Debts after
 * Budget with its hand of coins, Contacts first in Workspace. Accounts is not among
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
	HandCoins,
	Landmark,
	PiggyBank,
	Plug,
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
			{ titleKey: 'nav.budget', href: '/budget', icon: PiggyBank },
			{ titleKey: 'nav.debts', href: '/debts', icon: HandCoins }
		]
	},
	{
		labelKey: 'nav.workspace_group',
		items: [
			{ titleKey: 'nav.contacts', href: '/contacts', icon: Users },
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
			{ titleKey: 'account.nav_security', href: '/account/security', icon: Lock },
			// AI apps acting as this person over MCP (D106): personal, so here
			// rather than in a workspace's settings.
			{ titleKey: 'account.nav_mcp', href: '/account/mcp', icon: Plug }
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

/**
 * The operator console's sidebar (CSL, D125). Each row names the permission
 * that shows it; the console layout drops the rows the operator lacks. Hiding
 * a row is a courtesy: every console route checks the same permission in the
 * API. Rows for screens of later stories are pending.
 */
export type ConsoleNavItem = NavItem & { permission: string };

export const consoleNavGroups: { labelKey?: TranslationKey; items: ConsoleNavItem[] }[] = [
	{
		items: [
			{ titleKey: 'console.nav_overview', href: '/console', icon: LayoutDashboard, permission: 'console.read' }
		]
	},
	{
		labelKey: 'console.nav_people_group',
		items: [
			{ titleKey: 'console.nav_users', href: '/console/users', icon: User, permission: 'console.read' },
			{ titleKey: 'console.nav_workspaces', href: '/console/workspaces', icon: Users, permission: 'console.read' },
			{ titleKey: 'console.nav_feedback', href: '/console/feedback', icon: MessageSquareWarning, permission: 'console.read', pending: true }
		]
	},
	{
		labelKey: 'console.nav_system_group',
		items: [
			{ titleKey: 'console.nav_usage', href: '/console/usage', icon: ChartColumn, permission: 'console.read', pending: true },
			{ titleKey: 'console.nav_health', href: '/console/health', icon: TrendingDown, permission: 'console.read', pending: true }
		]
	},
	{
		labelKey: 'console.nav_access_group',
		items: [
			{ titleKey: 'console.nav_operators', href: '/console/operators', icon: Lock, permission: 'console.operators.manage', pending: true },
			{ titleKey: 'console.nav_roles', href: '/console/roles', icon: Settings, permission: 'console.roles.manage', pending: true },
			{ titleKey: 'console.nav_audit', href: '/console/audit', icon: Bot, permission: 'console.audit.read', pending: true }
		]
	}
];

/** The console sidebar as this operator may see it. */
export function consoleNavFor(permissions: string[]): NavGroup[] {
	return consoleNavGroups
		.map((group) => ({
			labelKey: group.labelKey,
			items: group.items.filter((item) => permissions.includes(item.permission))
		}))
		.filter((group) => group.items.length > 0);
}
