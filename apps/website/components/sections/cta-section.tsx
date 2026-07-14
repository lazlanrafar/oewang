"use client";

import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

import type { WebsiteDictionary } from "@/lib/translations";
import { useHeadlineReveal } from "@/lib/motion";
import { Container } from "./_shared";

export function CTASection({
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
  const title = useHeadlineReveal<HTMLHeadingElement>();

  return (
    <section id="start" className="py-24 sm:py-36">
      <Container>
        <div className="relative overflow-hidden border border-border bg-[hsl(var(--card))] px-6 py-16 text-center sm:px-10 sm:py-24">
          <div
            aria-hidden
            className="-z-0 pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(600px 320px at 50% 0%, hsl(var(--brand-accent)/0.14), transparent 70%)",
            }}
          />
          <div className="relative">
            <h2
              ref={title}
              className="reveal-headline mx-auto max-w-3xl font-serif text-4xl text-foreground leading-[1.05] tracking-tight sm:text-6xl"
            >
              {dictionary.cta.title}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-muted-foreground sm:text-lg">
              {dictionary.cta.subtitle}
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              {isLoggedIn ? (
                <Button size="lg" asChild>
                  <Link href={`${appUrl}/`}>
                    {dictionary.hero.ctaGoToDashboard}
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild>
                    <Link href={`${appUrl}/register`}>
                      {dictionary.cta.getStarted}
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <a href={`/${locale}#pricing`}>{dictionary.cta.viewPricing}</a>
                  </Button>
                </>
              )}
            </div>

            <p className="mt-5 text-muted-foreground text-xs">
              {dictionary.cta.trialNote}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
