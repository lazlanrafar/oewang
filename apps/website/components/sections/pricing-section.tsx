"use client";

import Link from "next/link";

import { Button } from "@workspace/ui/atoms";
import { Check } from "lucide-react";

import type { PublicPlan } from "@/lib/pricing.server";
import { formatMonthly } from "@/lib/pricing.server";
import type { WebsiteDictionary } from "@/lib/translations";
import { useStaggerReveal } from "@/lib/motion";
import { Container, SectionLabel } from "./_shared";

export function PricingSection({
  appUrl,
  dictionary,
  plans,
}: {
  appUrl: string;
  dictionary: WebsiteDictionary;
  plans: PublicPlan[];
}) {
  const ref = useStaggerReveal<HTMLDivElement>("[data-tier]", { y: 24 });

  // If the API is unreachable, hide the grid rather than showing stale/empty
  // hardcoded prices — the heading + a link to the app still render.
  const hasPlans = plans.length > 0;

  return (
    <section id="pricing" className="py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>{dictionary.pricing.label}</SectionLabel>
          <h2 className="mt-5 font-serif text-3xl text-foreground leading-tight tracking-tight sm:text-5xl">
            {dictionary.pricing.title}
          </h2>
          <p className="mt-4 text-muted-foreground sm:text-lg">
            {dictionary.pricing.subtitle}
          </p>
        </div>

        {hasPlans ? (
          <div
            ref={ref}
            className={`mt-16 grid grid-cols-1 gap-6 ${
              plans.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {plans.map((plan) => {
              const price = formatMonthly(plan);
              return (
                <div
                  key={plan.id}
                  data-tier
                  className={`relative flex flex-col border p-7 ${
                    plan.is_highlighted
                      ? "border-[hsl(var(--brand-accent))]/60 bg-[hsl(var(--card))]"
                      : "border-border bg-[hsl(var(--background))]"
                  }`}
                >
                  {plan.is_highlighted && (
                    <span className="absolute top-5 right-5 bg-[hsl(var(--brand-accent))] px-2.5 py-0.5 font-medium text-[10px] text-[hsl(var(--brand-accent-foreground))] uppercase tracking-wide">
                      Popular
                    </span>
                  )}
                  <h3 className="font-serif text-foreground text-xl tracking-tight">
                    {plan.name}
                  </h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-serif text-4xl text-foreground tracking-tight">
                      {price.amount}
                    </span>
                    {!price.isFree && (
                      <span className="text-muted-foreground text-sm">
                        {price.period}
                      </span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="mt-3 text-muted-foreground text-sm">
                      {plan.description}
                    </p>
                  )}

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="mt-0.5 size-4 shrink-0 text-[hsl(var(--brand-accent))]" />
                        <span className="text-foreground/90 text-sm">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {plan.comingSoon ? (
                    <Button
                      asChild
                      size="lg"
                      variant={plan.is_highlighted ? "default" : "outline"}
                      className="mt-8"
                    >
                      <Link href={`${appUrl}/register`}>{dictionary.pricing.ctaComingSoon}</Link>
                    </Button>
                  ) : (
                    <Button
                      asChild
                      size="lg"
                      variant={plan.is_highlighted ? "default" : "outline"}
                      className="mt-8"
                    >
                      <Link href={`${appUrl}/register`}>{dictionary.pricing.ctaGet}</Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-14 text-center">
            <Button asChild size="lg">
              <Link href={`${appUrl}/register`}>{dictionary.pricing.ctaGet}</Link>
            </Button>
          </div>
        )}

        <p className="mt-10 text-center text-muted-foreground text-xs">
          {dictionary.pricing.note}
        </p>
      </Container>
    </section>
  );
}
