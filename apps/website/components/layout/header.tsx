"use client";

import { useState } from "react";

import Link from "next/link";

import { Button } from "@workspace/ui/atoms";
import { Menu, X } from "lucide-react";

import type { WebsiteDictionary } from "@/lib/translations";
import { NAV_ITEMS } from "@/navigation/nav-items";
import { Brand } from "./brand";

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

  const withLocale = (path: string) => `/${locale}${path === "/" ? "" : path}`;

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: backdrop overlay uses div with role for click-outside behavior */}
      <div
        className={`fixed inset-0 z-40 bg-black/35 transition-opacity duration-200 ${
          isMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMenuOpen(false)}
        onKeyDown={() => setIsMenuOpen(false)}
        role="button"
        tabIndex={0}
      />

      <nav className="fixed top-0 right-0 left-0 z-50 w-full">
        <div className="motion-safe:fade-in motion-safe:slide-in-from-top-2 mx-auto max-w-[1300px] px-4 pt-3 duration-500 motion-safe:animate-in sm:px-6 xl:px-8">
          <div className="flex min-h-[56px] items-center justify-between border border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur-md sm:px-5">
            <Link
              href={withLocale("/")}
              className="inline-flex items-center transition-opacity duration-200 hover:opacity-80"
              aria-label="Oewang homepage"
            >
              <Brand />
            </Link>

            <div className="hidden items-center gap-0.5 xl:flex">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  className="relative px-3 py-2 text-muted-foreground text-sm transition-all duration-200 after:absolute after:right-3 after:bottom-[5px] after:left-3 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-200 hover:text-foreground hover:after:scale-x-100"
                >
                  {dictionary.nav[item.key as keyof typeof dictionary.nav]}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-2 xl:flex">
              {isLoggedIn ? (
                <Button asChild size="sm">
                  <Link href={`${appUrl}/`}>Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`${appUrl}/login`}>{dictionary.nav.signIn}</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`${appUrl}/register`}>{dictionary.hero.ctaStartFree}</Link>
                  </Button>
                </>
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
        </div>

        <div
          className={`fixed top-20 right-4 left-4 z-50 transition-all duration-200 xl:hidden ${
            isMenuOpen ? "translate-y-0 opacity-100" : "-translate-y-2 pointer-events-none opacity-0"
          }`}
        >
          <div className="border border-border bg-background p-5 shadow-sm">
            <div className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="block py-2 text-base text-foreground transition-colors hover:text-muted-foreground"
                >
                  {dictionary.nav[item.key as keyof typeof dictionary.nav]}
                </a>
              ))}
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
