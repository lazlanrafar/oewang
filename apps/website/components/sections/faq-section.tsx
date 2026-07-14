"use client";

import { useState } from "react";

import { Minus, Plus } from "lucide-react";

import type { WebsiteDictionary } from "@/lib/translations";

import { Container, SectionLabel } from "./_shared";

export function FaqSection({
  dictionary,
  items,
}: {
  dictionary: WebsiteDictionary;
  // Live FAQs from the API; falls back to the dictionary copy when empty.
  items?: { q: string; a: string }[];
}) {
  const faqItems = items && items.length > 0 ? items : dictionary.faq.items;
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="py-24 sm:py-32">
      <Container>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <SectionLabel>{dictionary.faq.label}</SectionLabel>
            <h2 className="mt-5 font-serif text-3xl text-foreground leading-tight tracking-tight sm:text-4xl">
              {dictionary.faq.title}
            </h2>
          </div>

          <div className="divide-y divide-border border-border border-t">
            {faqItems.map((item, i) => {
              const isOpen = open === i;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="font-serif text-foreground text-lg tracking-tight">{item.q}</span>
                    {isOpen ? (
                      <Minus className="size-4 shrink-0 text-[hsl(var(--brand-accent))]" />
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  <div
                    className="grid transition-all duration-300"
                    style={{
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                    }}
                  >
                    <div className="overflow-hidden">
                      <p className="pb-5 text-muted-foreground text-sm leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
