"use client";

import { useRef } from "react";

import { useGsapReveal } from "@/lib/use-gsap-reveal";
import type { WebsiteDictionary } from "@/lib/translations";

export function HowItWorksSection({ dictionary }: { dictionary: WebsiteDictionary }) {
  const ref = useRef<HTMLElement>(null);
  useGsapReveal(ref);

  return (
    <section id="capture" ref={ref} className="bg-background py-18 sm:py-24">
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.22em]">
            {dictionary.capture.label}
          </p>
          <h2 className="font-serif text-3xl text-foreground tracking-tight sm:text-4xl">
            {dictionary.capture.title}
          </h2>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed">{dictionary.capture.subtitle}</p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-none border border-border/70 bg-background p-6">
            <h3 className="font-medium text-foreground">{dictionary.capture.transactions.title}</h3>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {dictionary.capture.transactions.description}
            </p>
          </div>
          <div className="rounded-none border border-border/70 bg-background p-6">
            <h3 className="font-medium text-foreground">{dictionary.capture.receipt.title}</h3>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {dictionary.capture.receipt.description}
            </p>
          </div>
          <div className="rounded-none border border-border/70 bg-background p-6">
            <h3 className="font-medium text-foreground">{dictionary.capture.invoices.title}</h3>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              {dictionary.capture.invoices.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
