"use client";

import type { WebsiteDictionary } from "@/lib/translations";
import { useStaggerReveal } from "@/lib/motion";
import { Container, SectionLabel } from "./_shared";

export function ValuePillars({ dictionary }: { dictionary: WebsiteDictionary }) {
  const ref = useStaggerReveal<HTMLDivElement>("[data-pillar]");

  return (
    <section className="py-24 sm:py-32">
      <Container>
        <div className="max-w-2xl">
          <SectionLabel>{dictionary.pillars.label}</SectionLabel>
          <h2 className="mt-5 font-serif text-3xl text-foreground leading-tight tracking-tight sm:text-5xl">
            {dictionary.pillars.title}
          </h2>
        </div>

        <div
          ref={ref}
          className="mt-14 grid grid-cols-1 gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
        >
          {dictionary.pillars.items.map((item, i) => (
            <div
              key={item.title}
              data-pillar
              className="group relative bg-[hsl(var(--background))] p-7 transition-colors hover:bg-[hsl(var(--card))]"
            >
              <span className="font-mono text-[hsl(var(--brand-accent))] text-xs">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 font-serif text-foreground text-xl tracking-tight">
                {item.title}
              </h3>
              <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
