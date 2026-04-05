"use client";

import { Button } from "@workspace/ui/atoms";
import Link from "next/link";

interface Plan {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  note: string;
  highlighted: boolean;
  comingSoon?: boolean;
}

const DEFAULT_PLANS: Plan[] = [
  {
    name: "Starter",
    price: "$0",
    description:
      "For solo founders who want a clean starting point for their business finances.",
    features: [
      "Financial overview & widgets",
      "Weekly summaries and insights",
      "Transactions with categorization",
      "Up to 3 wallets",
      "Multi-currency (view only)",
      "Up to 1 workspace member",
    ],
    cta: "Get started free",
    note: "No credit card required",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$19",
    description:
      "For founders and small teams running their finance workflows end to end.",
    features: [
      "Everything in Starter",
      "Unlimited wallets",
      "Full multi-currency support",
      "Advanced insights & reports",
      "Custom categories",
      "Up to 5 workspace members",
      "Priority support",
    ],
    cta: "Start free trial",
    note: "14-day free trial · Cancel anytime",
    highlighted: true,
    comingSoon: true,
  },
  {
    name: "Business",
    price: "$49",
    description:
      "For growing teams that need full control, audit trails, and advanced collaboration.",
    features: [
      "Everything in Pro",
      "Unlimited workspace members",
      "Full audit log",
      "Role-based permissions",
      "API access",
      "Custom data exports",
      "Dedicated support",
    ],
    cta: "Start free trial",
    note: "14-day free trial · Cancel anytime",
    highlighted: false,
    comingSoon: true,
  },
];

interface PricingSectionProps {
  appUrl: string;
  plans?: Plan[];
}

export function PricingSection({ appUrl, plans }: PricingSectionProps) {
  const displayPlans = plans && plans.length > 0 ? plans : DEFAULT_PLANS;
  return (
    <section className="bg-background py-12 sm:py-16 lg:py-24">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-12">
          <h1 className="font-serif text-2xl sm:text-4xl text-foreground">
            Pricing that matches how you run your business
          </h1>
          <p className="hidden sm:block text-base text-muted-foreground leading-normal">
            Start simple, upgrade when your workflow gets more complex.
          </p>
        </div>

        {/* Cards */}
        <div className="flex flex-col lg:flex-row gap-8 justify-center items-center lg:items-stretch max-w-5xl mx-auto">
          {displayPlans.map((plan) => (
            <div key={plan.name} className="flex-1 max-w-sm w-full">
              <div
                className={`h-full flex flex-col border p-6 ${
                  plan.highlighted
                    ? "border-foreground relative"
                    : "border-border"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute top-0 right-5 -translate-y-1/2">
                    <div className="bg-background border border-foreground px-3 py-0.5">
                      <span className="text-xs text-foreground">
                        Most popular
                      </span>
                    </div>
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-base text-foreground mb-1">
                    {plan.name}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    {plan.description}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-3xl text-foreground">
                      {plan.price}
                    </span>
                    {plan.price !== "$0" && (
                      <span className="text-sm text-muted-foreground">
                        /month
                      </span>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="flex-1 border-t border-border pt-6 pb-6 space-y-2">
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-start gap-2">
                      <span className="text-foreground leading-[1.5rem] shrink-0">
                        •
                      </span>
                      <span className="text-sm text-foreground leading-relaxed">
                        {feat}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Button
                    asChild={!plan.comingSoon}
                    variant={plan.highlighted ? "default" : "outline"}
                    className="w-full"
                    disabled={plan.comingSoon}
                  >
                    {plan.comingSoon ? (
                      <span>Coming Soon</span>
                    ) : (
                      <Link href={`${appUrl}/register`}>{plan.cta}</Link>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    {plan.note}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-12 space-y-1">
          <p className="text-xs text-muted-foreground">
            All prices in USD. Local taxes may apply.
          </p>
        </div>
      </div>
    </section>
  );
}
