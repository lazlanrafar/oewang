"use client";

import type { WebsiteDictionary } from "@/lib/translations";
import { useStaggerReveal } from "@/lib/motion";
import { Container, SectionLabel } from "./_shared";

export function StatsSection({ dictionary }: { dictionary: WebsiteDictionary }) {
  const ref = useStaggerReveal<HTMLDivElement>("[data-stat]", { y: 20 });

  return (
    <section className="border-border/60 border-y bg-[hsl(var(--card))]/40 py-24 sm:py-28">
      <Container>
        <div className="max-w-2xl">
          <SectionLabel>{dictionary.stats.label}</SectionLabel>
          <h2 className="mt-5 font-serif text-3xl text-foreground leading-tight tracking-tight sm:text-4xl">
            {dictionary.stats.title}
          </h2>
        </div>

        <div
          ref={ref}
          className="mt-14 grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4"
        >
          {dictionary.stats.items.map((item) => (
            <div key={item.label} data-stat>
              <p className="font-serif text-5xl text-[hsl(var(--brand-accent))] tracking-tight sm:text-6xl">
                {item.value}
              </p>
              <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
