"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "EN" },
  { code: "id", label: "ID" },
  { code: "ja", label: "JP" },
] as const;

// Swaps only the leading locale segment of the current path, preserving the
// rest (e.g. /en/articles/foo → /id/articles/foo). Shared by header + footer.
export function LanguageSwitch({ locale, className = "" }: { locale: string; className?: string }) {
  const pathname = usePathname();

  const getLocaleHref = (code: string) => {
    const segments = pathname.split("/").filter(Boolean);
    const pathAfterLocale = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "/";
    return `/${code}${pathAfterLocale === "/" ? "" : pathAfterLocale}`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
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
  );
}
