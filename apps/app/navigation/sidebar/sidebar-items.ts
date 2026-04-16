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
        title: "sidebar.overview",
        url: "/overview",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: 2,
    label: "sidebar.finance",
    items: [
      {
        title: "sidebar.transactions",
        url: "/transactions",
        icon: Banknote,
      },
      {
        title: "sidebar.accounts",
        url: "/accounts",
        icon: IdCard,
      },
      {
        title: "sidebar.budget",
        url: "/budget",
        icon: PiggyBank,
      },
      {
        title: "sidebar.debts",
        url: "/debts",
        icon: HandCoins,
      },
    ],
  },
  {
    id: 3,
    label: "sidebar.planning",
    items: [
      {
        title: "sidebar.calendar",
        url: "/calendar",
        icon: Calendar,
      },
    ],
  },
  {
    id: 4,
    label: "sidebar.workspace",
    items: [
      {
        title: "sidebar.contacts",
        url: "/contacts",
        icon: Users,
      },
      {
        title: "sidebar.vault",
        url: "/vault",
        icon: Box,
      },
      {
        title: "sidebar.apps",
        url: "/apps",
        icon: DotSquare,
      },
    ],
  },
  {
    id: 5,
    label: "sidebar.system",
    items: [
      {
        title: "sidebar.settings",
        url: "/settings",
        icon: Settings,
      },
    ],
  },
];
