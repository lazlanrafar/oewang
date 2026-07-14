"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icons } from "@workspace/ui/atoms";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import type { WebsiteDictionary } from "@/lib/translations";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "id", label: "ID" },
  { code: "ja", label: "JP" },
] as const;

export function Footer({ locale, dictionary }: { locale: string; dictionary: WebsiteDictionary }) {
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
    <footer className="border-border/70 border-t bg-background">
      <div className="mx-auto max-w-[1300px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-start">
          <div>
            <Link
              href={withLocale("/")}
              className="mb-3 inline-flex items-center gap-2"
            >
              <Icons.LogoSmall className="size-6 text-foreground" />
              <span className="font-serif text-xl tracking-tight">oewang</span>
            </Link>
            <p className="mb-4 text-muted-foreground text-sm">{dictionary.footer.tagline}</p>
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="inline-flex items-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground"
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

          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex items-center gap-4">
              <Link
                href={withLocale("/terms")}
                className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              >
                Terms
              </Link>
              <Link
                href={withLocale("/policy")}
                className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              >
                Privacy
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {LANGUAGE_OPTIONS.map((item) => (
                <Link
                  key={item.code}
                  href={getLocaleHref(item.code)}
                  className={`border px-2.5 py-1 text-[11px] transition-colors ${
                    item.code === locale
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 h-px w-full border-border/70 border-t" />

        <p className="mt-4 text-muted-foreground text-xs">
          © {new Date().getFullYear()} Latoe. {dictionary.footer.rights}
        </p>
      </div>
    </footer>
  );
}
