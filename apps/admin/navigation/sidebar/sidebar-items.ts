import {
  Banknote,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
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
        title: "Overview",
        url: "/overview",
        icon: LayoutDashboard,
      },
      {
        title: "Orders",
        url: "/orders",
        icon: Banknote,
      },
    ],
  },
  {
    id: 2,
    label: "Management",
    items: [
      {
        title: "Users",
        url: "/users",
        icon: Users,
      },
      {
        title: "Workspaces",
        url: "/workspaces",
        icon: LayoutGrid,
      },
      {
        title: "Pricing",
        url: "/pricing",
        icon: Banknote,
      },
    ],
  },
];
