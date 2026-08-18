"use client";

import Link from "next/link";

import { Button } from "@workspace/ui/atoms";

import type { WebsiteDictionary } from "@/lib/translations";
import { useHeadlineReveal } from "@/lib/motion";
import { RotatingWord } from "./rotating-word";
import { Container, SectionLabel } from "./_shared";

export function HeroSection({
  isLoggedIn,
  appUrl,
  dictionary,
}: {
  isLoggedIn: boolean;
  appUrl: string;
  dictionary: WebsiteDictionary;
}) {
  const headline = useHeadlineReveal<HTMLHeadingElement>({ start: "top 92%" });

  return (
    <section
      id="overview"
      className="relative overflow-hidden pt-32 pb-4"
    >
      <Container>
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <SectionLabel>{dictionary.hero.badge}</SectionLabel>

          <h1
            ref={headline}
            className="reveal-headline mt-7 font-serif text-[2.75rem] text-foreground leading-[1.02] tracking-tight sm:text-6xl md:text-7xl"
          >
            {dictionary.hero.titleLead}{" "}
            <RotatingWord
              words={dictionary.hero.titleAccents}
              className="inline-block text-[hsl(var(--brand-accent))] italic"
            />
          </h1>

          <p className="mt-7 max-w-xl text-pretty text-base text-muted-foreground leading-relaxed sm:text-lg">
            {dictionary.hero.subtitle}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {isLoggedIn ? (
              <Button size="lg" asChild>
                <Link href={`${appUrl}/`}>{dictionary.hero.ctaGoToDashboard}</Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link href={`${appUrl}/register`}>
                    {dictionary.hero.ctaStartFree}
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#overview-flow">{dictionary.hero.ctaSeeHow}</a>
                </Button>
              </>
            )}
          </div>

          <p className="mt-5 text-muted-foreground text-xs">
            {dictionary.hero.trialNote}
          </p>
        </div>
      </Container>
    </section>
  );
}
