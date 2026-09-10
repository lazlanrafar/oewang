import {
  Banknote,
  Code2,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  Receipt,
  Sliders,
  Users,
  type LucideIcon,
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
    label: "Main",
    items: [
      {
        title: "Overview",
        url: "/overview",
        icon: LayoutDashboard,
      },
      {
        title: "Orders & Revenue",
        url: "/orders",
        icon: Receipt,
      },
    ],
  },
  {
    id: 2,
    label: "Platform Admin",
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
        title: "Pricing Plans",
        url: "/pricing",
        icon: Banknote,
      },
      {
        title: "Plan Features Setup",
        url: "/plan-features",
        icon: Sliders,
      },
    ],
  },
  {
    id: 3,
    label: "Marketing & Content",
    items: [
      {
        title: "Articles",
        url: "/articles",
        icon: FileText,
      },
      {
        title: "FAQs",
        url: "/faqs",
        icon: HelpCircle,
      },
    ],
  },
  {
    id: 4,
    label: "System",
    items: [
      {
        title: "Developer Tools",
        url: "/developer",
        icon: Code2,
      },
    ],
  },
];
