"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants, cn } from "@workspace/ui";
import {
  Banknote,
  Bell,
  CreditCard,
  DatabaseBackup,
  FileText,
  Languages,
  Lock,
  Monitor,
  Palette,
  PencilRuler,
  TrendingDown,
  User,
  Users,
  Wallet,
} from "lucide-react";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  dictionary: {
    sidebar: {
      profile: string;
      account: string;
      appearance: string;
      notifications: string;
      display: string;
      transaction: string;
      category_accounts: string;
      income_category: string;
      expenses_category: string;
      accounts: string;
      budget: string;
      general: string;
      backup: string;
      passcode: string;
      currency: string;
      alarm: string;
      language: string;
      billing: string;
      members: string;
      soon: string;
    };
  };
}

import { i18n } from "@/i18n-config";
import { canManageSensitiveWorkspace } from "@/lib/workspace-permissions";
import { useAppStore } from "@/stores/app";
import { useLocalizedRoute } from "@/utils/localized-route";

type SidebarLinkItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
};

type SidebarGroupItem = {
  groupLabel: string;
  items: SidebarLinkItem[];
};

type SidebarItem = SidebarLinkItem | SidebarGroupItem;

function isSidebarGroupItem(item: SidebarItem): item is SidebarGroupItem {
  return "groupLabel" in item;
}

export function SettingSidebar({ className, dictionary, ...props }: SidebarNavProps) {
  const pathname = usePathname();
  const { sidebar } = dictionary;
  const { getLocalizedUrl } = useLocalizedRoute();
  const workspaceRole = useAppStore((state) => state.workspace?.current_user_role);
  const canManageSensitive = canManageSensitiveWorkspace(workspaceRole);

  const sidebarNavItems: SidebarItem[] = [
    {
      title: sidebar.profile,
      href: "/settings/profile",
      icon: User,
    },
    ...(canManageSensitive
      ? [
          {
            title: sidebar.members,
            href: "/settings/members",
            icon: Users,
          } satisfies SidebarLinkItem,
        ]
      : []),
    // {
    //   title: sidebar.account,
    //   href: "/settings/account",
    //   icon: Settings,
    // },
    {
      title: sidebar.appearance,
      href: "/settings/appearance",
      icon: Palette,
    },
    {
      title: sidebar.notifications,
      href: "/settings/notifications",
      icon: Bell,
    },
    {
      title: sidebar.display,
      href: "/settings/display",
      icon: Monitor,
      comingSoon: true,
    },
    {
      title: sidebar.transaction,
      href: "/settings/transaction",
      icon: FileText,
    },
    {
      groupLabel: sidebar.category_accounts,
      items: [
        {
          title: sidebar.income_category,
          href: "/settings/income-category",
          icon: Wallet,
        },
        {
          title: sidebar.expenses_category,
          href: "/settings/expense-category",
          icon: TrendingDown,
        },
        // {
        //   title: sidebar.accounts,
        //   href: "/settings/wallets-and-banks",
        //   icon: Landmark,
        // },
        {
          title: sidebar.budget,
          href: "/settings/budget",
          icon: PencilRuler,
          comingSoon: true,
        },
      ],
    },
    {
      groupLabel: sidebar.general,
      items: [
        {
          title: sidebar.backup,
          href: "/settings/backup",
          icon: DatabaseBackup,
          comingSoon: true,
        },
        {
          title: sidebar.passcode,
          href: "/settings/passcode",
          icon: Lock,
          comingSoon: true,
        },
        {
          title: sidebar.currency,
          href: "/settings/currency",
          icon: Banknote,
        },
        {
          title: sidebar.alarm,
          href: "/settings/alarm",
          icon: Bell,
          comingSoon: true,
        },
        {
          title: sidebar.language,
          href: "/settings/language",
          icon: Languages,
        },
        ...(canManageSensitive
          ? [
              {
                title: sidebar.billing,
                href: "/settings/billing",
                icon: CreditCard,
              } satisfies SidebarLinkItem,
            ]
          : []),
      ],
    },
  ];

  // Strip locale from pathname to match sidebar items
  const activePath = pathname.split("/").filter(Boolean);
  if (i18n.locales.some((locale) => locale === activePath[0])) {
    activePath.shift();
  }
  const normalizedPath = `/${activePath.join("/")}`;

  return (
    <nav className={cn("flex max-h-[300px] flex-col space-y-1 overflow-y-auto lg:max-h-none", className)} {...props}>
      {sidebarNavItems.map((item) => {
        if (isSidebarGroupItem(item)) {
          return (
            <div key={item.groupLabel} className="mt-4 first:mt-0">
              <h4 className="mb-2 font-semibold text-muted-foreground text-xs tracking-tight">{item.groupLabel}</h4>
              <div className="space-y-1">
                {item.items.map((subItem) => (
                  <Link
                    key={subItem.href}
                    href={getLocalizedUrl(subItem.href)}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      normalizedPath === subItem.href
                        ? "bg-muted hover:bg-muted"
                        : "hover:bg-transparent hover:underline",
                      "w-full justify-start overflow-hidden",
                      subItem.comingSoon && "pointer-events-none opacity-60",
                    )}
                  >
                    {subItem.icon && <subItem.icon className="mr-2 size-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate text-left">{subItem.title}</span>
                    {subItem.comingSoon && (
                      <span className="ml-auto rounded-md border bg-muted/50 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
                        {sidebar.soon}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        }

        const flatItem = item;
        return (
          <Link
            key={flatItem.href}
            href={getLocalizedUrl(flatItem.href)}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              normalizedPath === flatItem.href ? "bg-muted hover:bg-muted" : "hover:bg-transparent hover:underline",
              "w-full justify-start overflow-hidden",
              flatItem.comingSoon && "pointer-events-none opacity-60",
            )}
          >
            {flatItem.icon && <flatItem.icon className="mr-2 size-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate text-left">{flatItem.title}</span>
            {flatItem.comingSoon && (
              <span className="ml-auto rounded-md border bg-muted/50 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground">
                {sidebar.soon}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
