import { Calendar } from "lucide-react";
import {
  Banknote,
  Box,
  Clock,
  DotSquare,
  FileText,
  IdCard,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  Users,
  Zap,
  HandCoins,
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
    // label: "Dashboard",
    items: [
      {
        title: "sidebar.overview",
        url: "/overview",
        icon: LayoutDashboard,
      },
      {
        title: "sidebar.transactions",
        url: "/transactions",
        icon: Banknote,
      },
      {
        title: "sidebar.calendar",
        url: "/calendar",
        icon: Calendar,
      },
    ],
  },
  {
    id: 2,
    label: "sidebar.finance",
    items: [
      {
        title: "sidebar.accounts",
        url: "/accounts",
        icon: IdCard,
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
    label: "sidebar.people",
    items: [
      {
        title: "sidebar.contacts",
        url: "/contacts",
        icon: Users,
      },
    ],
  },
  {
    id: 4,
    label: "sidebar.workspace",
    items: [
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
