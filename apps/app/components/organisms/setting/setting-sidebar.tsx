"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { buttonVariants, cn } from "@workspace/ui";
import {
  AppWindow,
  Banknote,
  Bell,
  Copy,
  DatabaseBackup,
  FileText,
  Landmark,
  Languages,
  Lock,
  Monitor,
  Palette,
  PencilRuler,
  Repeat,
  Settings,
  TrendingDown,
  User,
  Users,
  Wallet,
  CreditCard,
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

import { useLocalizedRoute } from "@/utils/localized-route";
import { i18n } from "@/i18n-config";

export function SettingSidebar({
  className,
  dictionary,
  ...props
}: SidebarNavProps) {
  const pathname = usePathname();
  const { sidebar } = dictionary;
  const { getLocalizedUrl } = useLocalizedRoute();

  const sidebarNavItems = [
    {
      title: sidebar.profile,
      href: "/settings/profile",
      icon: User,
    },
    {
      title: sidebar.members,
      href: "/settings/members",
      icon: Users,
    },
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
      comingSoon: true,
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
        {
          title: sidebar.accounts,
          href: "/settings/wallets-and-banks",
          icon: Landmark,
        },
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
        {
          title: sidebar.billing,
          href: "/settings/billing",
          icon: CreditCard,
        },
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
    <nav
      className={cn(
        "flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1",
        className,
      )}
      {...props}
    >
      {sidebarNavItems.map((item, index) => {
        if ("groupLabel" in item) {
          return (
            <div key={index} className="mt-4 first:mt-0">
              <h4 className="mb-2 text-xs font-semibold tracking-tight text-muted-foreground">
                {item.groupLabel}
              </h4>
              <div className="space-y-1">
                {/* biome-ignore lint/suspicious/noExplicitAny: implicit any */}
                {item.items?.map((subItem: any) => (
                  <Link
                    key={subItem.href}
                    href={getLocalizedUrl(subItem.href)}
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      normalizedPath === subItem.href
                        ? "bg-muted hover:bg-muted"
                        : "hover:bg-transparent hover:underline",
                      "justify-start w-full overflow-hidden",
                      subItem.comingSoon && "opacity-60 pointer-events-none",
                    )}
                  >
                    {subItem.icon && (
                      <subItem.icon className="mr-2 size-4 shrink-0" />
                    )}
                    <span className="flex-1 min-w-0 text-left truncate">
                      {subItem.title}
                    </span>
                    {subItem.comingSoon && (
                      <span className="ml-auto text-[10px] font-medium text-muted-foreground border px-1.5 py-0.5 rounded-md bg-muted/50">
                        {sidebar.soon}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        }

        // Handle flat items (backward compatibility or mixed use)
        // We cast to any because TS doesn't know for sure it's not a group without a discriminating union type definition
        // biome-ignore lint/suspicious/noExplicitAny: implicit any
        const flatItem = item as any;
        return (
          <Link
            key={flatItem.href}
            href={getLocalizedUrl(flatItem.href)}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              normalizedPath === flatItem.href
                ? "bg-muted hover:bg-muted"
                : "hover:bg-transparent hover:underline",
              "justify-start w-full overflow-hidden",
              flatItem.comingSoon && "opacity-60 pointer-events-none",
            )}
          >
            {flatItem.icon && (
              <flatItem.icon className="mr-2 size-4 shrink-0" />
            )}
            <span className="flex-1 min-w-0 text-left truncate">
              {flatItem.title}
            </span>
            {flatItem.comingSoon && (
              <span className="ml-auto text-[10px] font-medium text-muted-foreground border px-1.5 py-0.5 rounded-md bg-muted/50">
                {sidebar.soon}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
