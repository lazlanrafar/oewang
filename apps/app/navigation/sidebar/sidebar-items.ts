import {
  Banknote,
  Box,
  Calendar,
  DotSquare,
  HandCoins,
  IdCard,
  LayoutDashboard,
  type LucideIcon,
  PiggyBank,
  Settings,
  Users,
} from "lucide-react";

export interface NavSubItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavMainItem {
  title: string;
  url: string;
  icon?: LucideIcon;
  subItems?: NavSubItem[];
  comingSoon?: boolean;
  newTab?: boolean;
  isNew?: boolean;
}

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    items: [
      {
        title: "sidebar.overview_label",
        url: "/overview",
        icon: LayoutDashboard,
      },
      {
        title: "sidebar.calendar_label",
        url: "/calendar",
        icon: Calendar,
      },
    ],
  },
  {
    id: 2,
    label: "sidebar.finance_label",
    items: [
      {
        title: "sidebar.transactions_label",
        url: "/transactions",
        icon: Banknote,
      },
      {
        title: "sidebar.accounts_label",
        url: "/accounts",
        icon: IdCard,
      },
      {
        title: "sidebar.budget_label",
        url: "/budget",
        icon: PiggyBank,
      },
      {
        title: "sidebar.debts_label",
        url: "/debts",
        icon: HandCoins,
      },
    ],
  },
  {
    id: 4,
    label: "sidebar.workspace_label",
    items: [
      {
        title: "sidebar.contacts_label",
        url: "/contacts",
        icon: Users,
      },
      {
        title: "sidebar.vault_label",
        url: "/vault",
        icon: Box,
      },
      {
        title: "sidebar.apps_label",
        url: "/apps",
        icon: DotSquare,
      },
    ],
  },
  {
    id: 5,
    label: "sidebar.system_label",
    items: [
      {
        title: "sidebar.settings_label",
        url: "/settings",
        icon: Settings,
      },
    ],
  },
];
