import {
  Banknote,
  LayoutDashboard,
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
        title: "Revenue",
        url: "/revenue",
        icon: Banknote,
      },
      {
        title: "Pricing",
        url: "/pricing",
        icon: Banknote,
      },
    ],
  },
];
