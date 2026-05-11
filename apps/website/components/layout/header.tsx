"use client";

import { Button } from "@workspace/ui/atoms";
import Link from "next/link";
import { Menu, X, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/navigation/nav-items";
import { i18n } from "@/i18n-config";
import type { WebsiteDictionary } from "@/lib/translations";

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
  const hasLocalePrefix = i18n.locales.includes(
    firstSegment as (typeof i18n.locales)[number],
  );
  const pathAfterLocale = hasLocalePrefix
    ? `/${segments.slice(1).join("/")}`
    : pathname;

  const withLocale = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  const desktopItems = [
    { label: "Pricing", href: "/pricing" },
    { label: "Story", href: "/story" },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/35 transition-opacity duration-200 ${
          isMenuOpen || activeMegaMenu
            ? "opacity-100"
            : "opacity-0 pointer-events-none"
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

      <nav className="fixed top-0 left-0 right-0 z-50 w-full">
        <div
          className="mx-auto max-w-[1300px] px-4 sm:px-6 xl:px-8 pt-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 duration-500"
          onMouseLeave={scheduleCloseMegaMenu}
        >
          <div className="flex items-center justify-between border border-border/60 bg-background/95 backdrop-blur-md px-4 sm:px-5 py-2.5 min-h-[56px]">
            <Link
              href={withLocale("/")}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity duration-200"
              aria-label="oewang homepage"
            >
              <span className="font-serif text-xl tracking-tight">oewang</span>
            </Link>

            <div className="hidden xl:flex items-center gap-0.5">
              <button
                type="button"
                onMouseEnter={() => openMegaMenu("features")}
                  className={`px-3 py-2 text-sm transition-all duration-200 inline-flex items-center gap-1 relative after:absolute after:left-3 after:right-3 after:bottom-[5px] after:h-px after:origin-left after:scale-x-0 after:transition-transform after:duration-200 after:bg-foreground ${
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
                    className={`px-3 py-2 text-sm transition-all duration-200 relative after:absolute after:left-3 after:right-3 after:bottom-[5px] after:h-px after:origin-left after:scale-x-0 after:transition-transform after:duration-200 after:bg-foreground ${
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
                className={`px-3 py-2 text-sm transition-all duration-200 inline-flex items-center gap-1 relative after:absolute after:left-3 after:right-3 after:bottom-[5px] after:h-px after:origin-left after:scale-x-0 after:transition-transform after:duration-200 after:bg-foreground ${
                  activeMegaMenu === "resources"
                    ? "text-foreground after:scale-x-100"
                    : "text-muted-foreground hover:text-foreground hover:after:scale-x-100"
                }`}
              >
                Resources
                <ChevronDown className="size-3.5" />
              </button>
            </div>

            <div className="hidden xl:flex items-center gap-2">
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
              className="xl:hidden p-2 text-foreground"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>

          <div
            className={`hidden xl:block overflow-hidden border border-t-0 border-border/60 bg-background transition-all duration-300 ease-out ${
              activeMegaMenu
                ? "max-h-[470px] opacity-100 translate-y-0"
                : "max-h-0 opacity-0 -translate-y-1 pointer-events-none"
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
                        className="px-4 py-3 hover:bg-muted/25 transition-all duration-200 hover:translate-x-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1"
                      >
                        <p className="text-foreground text-[15px] leading-tight">{item.title}</p>
                        <p className="text-muted-foreground text-[13px] mt-2">{item.description}</p>
                      </Link>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Link
                      href={withLocale("/pre-accounting")}
                      className="border border-border/80 min-h-[320px] flex flex-col justify-between hover:bg-muted/20 transition-all duration-300 hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
                    >
                      <div className="flex-1 flex items-center justify-center">
                        <div className="size-28 border border-border bg-muted/20" />
                      </div>
                      <div className="border-t border-border/80 p-4">
                        <p className="text-[15px] leading-tight">Pre-accounting</p>
                        <p className="text-[13px] text-muted-foreground mt-2">
                          Clean records ready for your accountant
                        </p>
                      </div>
                    </Link>

                    <Link
                      href={withLocale("/testimonials")}
                      className="border border-border/80 min-h-[320px] flex flex-col justify-between hover:bg-muted/20 transition-all duration-300 hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
                    >
                      <div className="flex-1 flex items-center justify-center px-6">
                        <p className="font-serif text-4xl leading-tight text-center">
                          “Everything lives in one place now.”
                        </p>
                      </div>
                      <div className="border-t border-border/80 p-4">
                        <p className="text-[15px] leading-tight">Customer Stories</p>
                        <p className="text-[13px] text-muted-foreground mt-2">
                          See how founders use Oewang
                        </p>
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
                        className="px-4 py-3 hover:bg-muted/25 transition-all duration-200 hover:translate-x-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1"
                      >
                        <p className="text-foreground text-[15px] leading-tight">{item.title}</p>
                        <p className="text-muted-foreground text-[13px] mt-2">{item.description}</p>
                      </Link>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Link
                      href={withLocale("/integrations")}
                      className="border border-border/80 min-h-[320px] flex flex-col justify-between hover:bg-muted/20 transition-all duration-300 hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
                    >
                      <div className="flex-1 flex items-center justify-center px-8">
                        <p className="font-serif text-6xl opacity-80">Integrations</p>
                      </div>
                      <div className="border-t border-border/80 p-4">
                        <p className="text-[15px] leading-tight">Integrations</p>
                        <p className="text-[13px] text-muted-foreground mt-2">
                          Connect your existing tools
                        </p>
                      </div>
                    </Link>

                    <Link
                      href={withLocale("/updates")}
                      className="border border-border/80 min-h-[320px] flex flex-col justify-between hover:bg-muted/20 transition-all duration-300 hover:-translate-y-0.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
                    >
                      <div className="flex-1 flex items-center justify-center">
                        <div className="w-44 h-16 border border-border bg-muted/20" />
                      </div>
                      <div className="border-t border-border/80 p-4">
                        <p className="text-[15px] leading-tight">Updates</p>
                        <p className="text-[13px] text-muted-foreground mt-2">
                          See what is new in Oewang
                        </p>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`xl:hidden fixed top-20 left-4 right-4 z-50 transition-all duration-200 ${
            isMenuOpen
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
        >
          <div className="border border-border bg-background shadow-sm p-5">
            <div className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={withLocale(item.href)}
                  onClick={() => setIsMenuOpen(false)}
                  className="block text-base text-foreground hover:text-muted-foreground transition-colors py-2"
                >
                  {dictionary.nav[item.key as keyof typeof dictionary.nav]}
                </Link>
              ))}
              <Link
                href={withLocale("/docs")}
                onClick={() => setIsMenuOpen(false)}
                className="block text-base text-foreground hover:text-muted-foreground transition-colors py-2"
              >
                Documentation
              </Link>
              <Link
                href={withLocale("/updates")}
                onClick={() => setIsMenuOpen(false)}
                className="block text-base text-foreground hover:text-muted-foreground transition-colors py-2"
              >
                Updates
              </Link>
            </div>

            <div className="my-4 h-px border-t border-border" />

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
