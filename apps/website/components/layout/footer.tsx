"use client";

import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import type { WebsiteDictionary } from "@/lib/translations";

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/integrations", label: "Integrations" },
      { href: "/pre-accounting", label: "Pre-accounting" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/story", label: "Story" },
      { href: "/testimonials", label: "Customer Stories" },
      { href: "/updates", label: "Updates" },
      { href: "/support", label: "Support" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Documentation" },
      { href: "/chat", label: "Chat" },
      { href: "/computer", label: "Computer" },
      { href: "/terms", label: "Terms" },
      { href: "/policy", label: "Privacy" },
    ],
  },
];

const LANGUAGE_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "id", label: "ID" },
  { code: "ja", label: "JP" },
] as const;

export function Footer({
  locale,
  dictionary,
}: {
  locale: string;
  dictionary: WebsiteDictionary;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const withLocale = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  const getLocaleHref = (code: string) => {
    const segments = pathname.split("/").filter(Boolean);
    const pathAfterLocale = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "/";
    return `/${code}${pathAfterLocale === "/" ? "" : pathAfterLocale}`;
  };

  return (
    <footer className="bg-background border-t border-border/70">
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10">
          <div className="max-w-sm">
            <Link href={withLocale("/")} className="inline-block mb-4">
              <span className="font-serif text-xl tracking-tight">oewang</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-5">{dictionary.footer.tagline}</p>
            <button
              type="button"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {mounted ? (
                resolvedTheme === "dark" ? (
                  <Sun className="size-3.5" />
                ) : (
                  <Moon className="size-3.5" />
                )
              ) : (
                <div className="size-3.5" />
              )}
              <span>
                {mounted
                  ? resolvedTheme === "dark"
                    ? dictionary.footer.lightMode
                    : dictionary.footer.darkMode
                  : "Theme"}
              </span>
            </button>
          </div>

          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs uppercase tracking-[0.18em] text-foreground/80 mb-3">
                {group.title}
              </h3>
              <div className="space-y-2.5">
                {group.links.map((item) => (
                  <Link
                    key={item.href}
                    href={withLocale(item.href)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors block"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="my-10 h-px w-full border-t border-border/70" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Latoe. {dictionary.footer.rights}
            </p>
            <div className="flex items-center gap-2">
              {LANGUAGE_OPTIONS.map((item) => (
                <Link
                  key={item.code}
                  href={getLocaleHref(item.code)}
                  className={`px-2.5 py-1 text-[11px] border transition-colors ${
                    item.code === locale
                      ? "bg-foreground text-background border-foreground"
                      : "text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              X / Twitter
            </a>
            <a
              href="https://www.linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
