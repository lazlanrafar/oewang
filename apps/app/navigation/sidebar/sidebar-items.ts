import {
  Banknote,
  LayoutDashboard,
  Settings,
  IdCard,
  LucideIcon,
  Box,
  DotSquare,
  Users,
  Clock,
  Inbox,
  FileText,
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
        title: "Overview",
        url: "/overview",
        icon: LayoutDashboard,
      },
      {
        title: "Transactions",
        url: "/transactions",
        icon: Banknote,
      },
      {
        title: "Invoices",
        url: "/coming-soon",
        icon: FileText,
      },
      {
        title: "Accounts",
        url: "/accounts",
        icon: IdCard,
      },
    ],
  },
  {
    id: 2,
    label: "Management",
    items: [
      {
        title: "Customers",
        url: "/coming-soon",
        icon: Users,
      },
      {
        title: "Tracker",
        url: "/coming-soon",
        icon: Clock,
      },
      {
        title: "Inbox",
        url: "/coming-soon",
        icon: Inbox,
      },
    ],
  },
  {
    id: 3,
    label: "Storage",
    items: [
      {
        title: "Vault",
        url: "/vault",
        icon: Box,
      },
      {
        title: "Apps",
        url: "/apps",
        icon: DotSquare,
      },
    ],
  },
  {
    id: 4,
    label: "Others",
    items: [
      {
        title: "Settings",
        url: "/settings",
        icon: Settings,
      },
    ],
  },
];
