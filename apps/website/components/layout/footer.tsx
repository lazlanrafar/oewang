"use client";

import Link from "next/link";

import type { WebsiteDictionary } from "@/lib/translations";

import { Brand } from "./brand";
import { LanguageSwitch } from "./language-switch";

export function Footer({ locale, dictionary }: { locale: string; dictionary: WebsiteDictionary }) {
  const withLocale = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  return (
    <footer className="border-border/70 border-t bg-[hsl(var(--background))]">
      <div className="mx-auto max-w-[1300px] px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div className="max-w-xs">
            <Link href={withLocale("/")} className="mb-4 inline-flex items-center" aria-label="Oewang homepage">
              <Brand />
            </Link>
            <p className="text-muted-foreground text-sm">{dictionary.footer.tagline}</p>
          </div>

          <div className="flex flex-wrap gap-12">
            <nav className="flex flex-col gap-3">
              <span className="text-muted-foreground/70 text-xs uppercase tracking-[0.2em]">
                {dictionary.footer.product}
              </span>
              <a href="#features" className="text-foreground/80 text-sm transition-colors hover:text-foreground">
                {dictionary.nav.features}
              </a>
              <a href="#pricing" className="text-foreground/80 text-sm transition-colors hover:text-foreground">
                {dictionary.nav.pricing}
              </a>
              <a href="#faq" className="text-foreground/80 text-sm transition-colors hover:text-foreground">
                {dictionary.nav.faq}
              </a>
            </nav>

            <nav className="flex flex-col gap-3">
              <span className="text-muted-foreground/70 text-xs uppercase tracking-[0.2em]">
                {dictionary.footer.company}
              </span>
              <Link
                href={withLocale("/articles")}
                className="text-foreground/80 text-sm transition-colors hover:text-foreground"
              >
                {dictionary.footer.articles}
              </Link>
              <Link
                href={withLocale("/terms")}
                className="text-foreground/80 text-sm transition-colors hover:text-foreground"
              >
                {dictionary.footer.terms}
              </Link>
              <Link
                href={withLocale("/policy")}
                className="text-foreground/80 text-sm transition-colors hover:text-foreground"
              >
                {dictionary.footer.privacy}
              </Link>
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse items-start justify-between gap-4 border-border/70 border-t pt-6 sm:flex-row sm:items-center">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} Latoe. {dictionary.footer.rights}
          </p>
          <LanguageSwitch locale={locale} />
        </div>
      </div>
    </footer>
  );
}
