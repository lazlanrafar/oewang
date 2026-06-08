"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@workspace/ui/atoms";
import { ChevronDown, Menu, X } from "lucide-react";

import { i18n } from "@/i18n-config";
import type { WebsiteDictionary } from "@/lib/translations";
import { NAV_ITEMS } from "@/navigation/nav-items";

type MegaMenuType = "features" | "resources";

const FEATURES_MENU = [
  { title: "Invoicing", description: "Get paid faster", href: "/features/invoicing" },
  { title: "Customers", description: "Know your customers", href: "/features/customers" },
  {
    title: "Transactions",
    description: "All transactions together",
    href: "/features/transactions",
  },
  { title: "Files", description: "Everything in one place", href: "/features/files" },
  { title: "Inbox", description: "Receipts handled automatically", href: "/features/inbox" },
  { title: "Exports", description: "Accounting ready", href: "/features/exports" },
  { title: "Time tracking", description: "See where time goes", href: "/features/time-tracking" },
  { title: "Assistant", description: "Ask anything, get things done", href: "/features/assistant" },
];

const RESOURCES_MENU = [
  {
    title: "Integrations",
    description: "Connect your existing tools.",
    href: "/integrations",
  },
  { title: "Documentation", description: "Learn how to use Oewang.", href: "/docs" },
  { title: "AI Integrations", description: "Connect AI tools to your business data.", href: "/integrations" },
  { title: "Developer & API", description: "Programmatic access to Oewang.", href: "/docs" },
  { title: "Chat", description: "Run your business from any chat app.", href: "/chat" },
];

export function Header({
  isLoggedIn,
  appUrl,
  locale,
  dictionary,
}: {
  isLoggedIn: boolean;
  appUrl: string;
  locale: string;
  dictionary: WebsiteDictionary;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeMegaMenu, setActiveMegaMenu] = useState<MegaMenuType | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const openMegaMenu = (menu: MegaMenuType) => {
    clearCloseTimer();
    setActiveMegaMenu(menu);
  };

  const scheduleCloseMegaMenu = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setActiveMegaMenu(null);
    }, 200);
  };

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0] ?? "";
  const hasLocalePrefix = i18n.locales.includes(firstSegment as (typeof i18n.locales)[number]);
  const _pathAfterLocale = hasLocalePrefix ? `/${segments.slice(1).join("/")}` : pathname;

  const withLocale = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  const desktopItems = [
    { label: "Pricing", href: "/pricing" },
    { label: "Story", href: "/story" },
  ];

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: backdrop overlay uses div with role for click-outside behavior */}
      <div
        className={`fixed inset-0 z-40 bg-black/35 transition-opacity duration-200 ${
          isMenuOpen || activeMegaMenu ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => {
          setIsMenuOpen(false);
          setActiveMegaMenu(null);
        }}
        onKeyDown={() => {
          setIsMenuOpen(false);
          setActiveMegaMenu(null);
        }}
        role="button"
        tabIndex={0}
      />

      <nav className="fixed top-0 right-0 left-0 z-50 w-full">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: layout div uses mouse events for mega menu hover behavior */}
        <div
          className="motion-safe:fade-in motion-safe:slide-in-from-top-2 mx-auto max-w-[1300px] px-4 pt-3 duration-500 motion-safe:animate-in sm:px-6 xl:px-8"
          onMouseLeave={scheduleCloseMegaMenu}
        >
          <div className="flex min-h-[56px] items-center justify-between border border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md sm:px-5">
            <Link
              href={withLocale("/")}
              className="flex items-center gap-2 transition-opacity duration-200 hover:opacity-80"
              aria-label="oewang homepage"
            >
              <span className="font-serif text-xl tracking-tight">oewang</span>
            </Link>

            <div className="hidden items-center gap-0.5 xl:flex">
              <button
                type="button"
                onMouseEnter={() => openMegaMenu("features")}
                className={`relative inline-flex items-center gap-1 px-3 py-2 text-sm transition-all duration-200 after:absolute after:right-3 after:bottom-[5px] after:left-3 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-200 ${
                  activeMegaMenu === "features" || pathname.startsWith(`/${locale}/features`)
                    ? "text-foreground after:scale-x-100"
                    : "text-muted-foreground hover:text-foreground hover:after:scale-x-100"
                }`}
              >
                {dictionary.nav.features}
                <ChevronDown className="size-3.5" />
              </button>

              {desktopItems.map((item) => {
                const href = withLocale(item.href);
                const isActive = pathname === href;

                return (
                  <Link
                    key={item.href}
                    href={href}
                    className={`relative px-3 py-2 text-sm transition-all duration-200 after:absolute after:right-3 after:bottom-[5px] after:left-3 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-200 ${
                      isActive
                        ? "text-foreground after:scale-x-100"
                        : "text-muted-foreground hover:text-foreground hover:after:scale-x-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <button
                type="button"
                onMouseEnter={() => openMegaMenu("resources")}
                className={`relative inline-flex items-center gap-1 px-3 py-2 text-sm transition-all duration-200 after:absolute after:right-3 after:bottom-[5px] after:left-3 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-200 ${
                  activeMegaMenu === "resources"
                    ? "text-foreground after:scale-x-100"
                    : "text-muted-foreground hover:text-foreground hover:after:scale-x-100"
                }`}
              >
                Resources
                <ChevronDown className="size-3.5" />
              </button>
            </div>

            <div className="hidden items-center gap-2 xl:flex">
              {isLoggedIn ? (
                <Button asChild size="sm">
                  <Link href={`${appUrl}/`}>Dashboard</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`${appUrl}/login`}>{dictionary.nav.signIn}</Link>
                </Button>
              )}
            </div>

            <button
              type="button"
              className="p-2 text-foreground xl:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>

          {/* biome-ignore lint/a11y/noStaticElementInteractions: mega menu panel uses mouse events for hover delay behavior */}
          <div
            className={`hidden overflow-hidden border border-border/60 border-t-0 bg-background transition-all duration-300 ease-out xl:block ${
              activeMegaMenu
                ? "max-h-[470px] translate-y-0 opacity-100"
                : "-translate-y-1 pointer-events-none max-h-0 opacity-0"
            }`}
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleCloseMegaMenu}
          >
            <div className="p-7">
              {activeMegaMenu === "features" && (
                <div className="grid grid-cols-[1.1fr_1.35fr] gap-7">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    {FEATURES_MENU.map((item) => (
                      <Link
                        key={item.title}
                        href={withLocale(item.href)}
                        className="motion-safe:fade-in motion-safe:slide-in-from-left-1 px-4 py-3 transition-all duration-200 hover:translate-x-0.5 hover:bg-muted/25 motion-safe:animate-in"
                      >
                        <p className="text-[15px] text-foreground leading-tight">{item.title}</p>
                        <p className="mt-2 text-[13px] text-muted-foreground">{item.description}</p>
                      </Link>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Link
                      href={withLocale("/pre-accounting")}
                      className="hover:-translate-y-0.5 motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex min-h-[320px] flex-col justify-between border border-border/80 transition-all duration-300 hover:bg-muted/20 motion-safe:animate-in"
                    >
                      <div className="flex flex-1 items-center justify-center">
                        <div className="size-28 border border-border bg-muted/20" />
                      </div>
                      <div className="border-border/80 border-t p-4">
                        <p className="text-[15px] leading-tight">Pre-accounting</p>
                        <p className="mt-2 text-[13px] text-muted-foreground">
                          Clean records ready for your accountant
                        </p>
                      </div>
                    </Link>

                    <Link
                      href={withLocale("/testimonials")}
                      className="hover:-translate-y-0.5 motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex min-h-[320px] flex-col justify-between border border-border/80 transition-all duration-300 hover:bg-muted/20 motion-safe:animate-in"
                    >
                      <div className="flex flex-1 items-center justify-center px-6">
                        <p className="text-center font-serif text-4xl leading-tight">
                          “Everything lives in one place now.”
                        </p>
                      </div>
                      <div className="border-border/80 border-t p-4">
                        <p className="text-[15px] leading-tight">Customer Stories</p>
                        <p className="mt-2 text-[13px] text-muted-foreground">See how people use Oewang</p>
                      </div>
                    </Link>
                  </div>
                </div>
              )}

              {activeMegaMenu === "resources" && (
                <div className="grid grid-cols-[1.1fr_1.35fr] gap-7">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    {RESOURCES_MENU.map((item) => (
                      <Link
                        key={item.title}
                        href={withLocale(item.href)}
                        className="motion-safe:fade-in motion-safe:slide-in-from-left-1 px-4 py-3 transition-all duration-200 hover:translate-x-0.5 hover:bg-muted/25 motion-safe:animate-in"
                      >
                        <p className="text-[15px] text-foreground leading-tight">{item.title}</p>
                        <p className="mt-2 text-[13px] text-muted-foreground">{item.description}</p>
                      </Link>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Link
                      href={withLocale("/integrations")}
                      className="hover:-translate-y-0.5 motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex min-h-[320px] flex-col justify-between border border-border/80 transition-all duration-300 hover:bg-muted/20 motion-safe:animate-in"
                    >
                      <div className="flex flex-1 items-center justify-center px-8">
                        <p className="font-serif text-6xl opacity-80">Integrations</p>
                      </div>
                      <div className="border-border/80 border-t p-4">
                        <p className="text-[15px] leading-tight">Integrations</p>
                        <p className="mt-2 text-[13px] text-muted-foreground">Connect your existing tools</p>
                      </div>
                    </Link>

                    <Link
                      href={withLocale("/updates")}
                      className="hover:-translate-y-0.5 motion-safe:fade-in motion-safe:slide-in-from-bottom-2 flex min-h-[320px] flex-col justify-between border border-border/80 transition-all duration-300 hover:bg-muted/20 motion-safe:animate-in"
                    >
                      <div className="flex flex-1 items-center justify-center">
                        <div className="h-16 w-44 border border-border bg-muted/20" />
                      </div>
                      <div className="border-border/80 border-t p-4">
                        <p className="text-[15px] leading-tight">Updates</p>
                        <p className="mt-2 text-[13px] text-muted-foreground">See what is new in Oewang</p>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`fixed top-20 right-4 left-4 z-50 transition-all duration-200 xl:hidden ${
            isMenuOpen ? "translate-y-0 opacity-100" : "-translate-y-2 pointer-events-none opacity-0"
          }`}
        >
          <div className="border border-border bg-background p-5 shadow-sm">
            <div className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={withLocale(item.href)}
                  onClick={() => setIsMenuOpen(false)}
                  className="block py-2 text-base text-foreground transition-colors hover:text-muted-foreground"
                >
                  {dictionary.nav[item.key as keyof typeof dictionary.nav]}
                </Link>
              ))}
              <Link
                href={withLocale("/docs")}
                onClick={() => setIsMenuOpen(false)}
                className="block py-2 text-base text-foreground transition-colors hover:text-muted-foreground"
              >
                Documentation
              </Link>
              <Link
                href={withLocale("/updates")}
                onClick={() => setIsMenuOpen(false)}
                className="block py-2 text-base text-foreground transition-colors hover:text-muted-foreground"
              >
                Updates
              </Link>
            </div>

            <div className="my-4 h-px border-border border-t" />

            {isLoggedIn ? (
              <Button asChild size="lg" className="w-full">
                <Link href={`${appUrl}/`}>Dashboard</Link>
              </Button>
            ) : (
              <Button variant="outline" size="lg" className="w-full" asChild>
                <Link href={`${appUrl}/login`}>{dictionary.nav.signIn}</Link>
              </Button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
