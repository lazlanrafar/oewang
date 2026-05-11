"use client";

import * as React from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { createCheckoutSession } from "@workspace/modules/mayar/mayar.action";
import { getPricing } from "@workspace/modules/pricing/pricing.action";
import type { TransactionSettings, Workspace } from "@workspace/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  cn,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui";
import { annualSavingsPct, displayPrice, getGatewayPrice } from "@workspace/utils";
import { motion } from "framer-motion";
import { Check, Info, Rocket, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

interface UpgradeClientProps {
  dictionary: Dictionary;
  settings: TransactionSettings;
  workspace: Workspace | null;
}

const planIcons: Record<string, React.ReactNode> = {
  starter: <Rocket className="h-6 w-6 text-blue-500" />,
  pro: <Zap className="h-6 w-6 text-amber-500" />,
  business: <ShieldCheck className="h-6 w-6 text-purple-500" />,
};

export function UpgradeClient({ dictionary, settings, workspace }: UpgradeClientProps) {
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">("annual");
  const [currency, setCurrency] = React.useState(settings?.mainCurrencyCode.toLowerCase() || "usd");

  React.useEffect(() => {
    if (settings?.mainCurrencyCode) {
      setCurrency(settings?.mainCurrencyCode.toLowerCase());
    }
  }, [settings?.mainCurrencyCode]);

  const { data: pricingData, isLoading } = useQuery({
    queryKey: ["pricing"],
    queryFn: async () => {
      const result = await getPricing({ is_active: "true" });
      if (result.success) return result.data.pricingList;
      throw new Error(result.error);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId?: string | null) => {
      const result = await createCheckoutSession(
        priceId,
        workspace?.id,
        "/settings/billing",
        "subscription",
        undefined,
        undefined,
        undefined,
        billingCycle,
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-12 px-6 py-16">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-64" />
          <Skeleton className="mx-auto h-4 w-48" />
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <Skeleton className="h-[600px] rounded-3xl" />
          <Skeleton className="h-[600px] rounded-3xl" />
          <Skeleton className="h-[600px] rounded-3xl" />
        </div>
      </div>
    );
  }

  // Sort plans: Free -> Pro -> Business (fallback to alphabetical if names differ)
  const sortedPlans = [...(pricingData || [])].sort((a, b) => {
    const order = ["starter", "pro", "business"];
    const aPower = order.indexOf(a.name.toLowerCase());
    const bPower = order.indexOf(b.name.toLowerCase());
    return aPower - bPower;
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-16 px-6 py-16 md:py-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-4 text-center"
      >
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/5 px-3 py-1 font-bold text-primary text-xs uppercase tracking-wider">
          <Sparkles className="h-3.5 w-3.5" />
          {dictionary.settings.billing.special_launch_pricing || "Special Launch Pricing"}
        </div>
        <h1 className="font-black text-4xl text-foreground tracking-tight md:text-6xl">
          {dictionary.settings.billing.upgrade_title || "Scale your finances with Oewang"}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          {dictionary.settings.billing.upgrade_description ||
            "Choose the plan that fits your current needs. Start small and grow as your business scales."}
        </p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-col items-center space-y-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="inline-flex rounded-xl bg-muted/50 p-1 shadow-inner">
            <Tabs
              value={billingCycle}
              onValueChange={(v) => {
                if (v === "monthly" || v === "annual") {
                  setBillingCycle(v);
                }
              }}
              className="w-auto"
            >
              <TabsList className="h-10 gap-1 bg-transparent">
                <TabsTrigger
                  value="monthly"
                  className="rounded-lg px-6 py-2 font-medium text-sm transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {dictionary.settings.billing.monthly_toggle || "Monthly"}
                </TabsTrigger>
                <TabsTrigger
                  value="annual"
                  className="relative rounded-lg px-6 py-2 font-medium text-sm transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {dictionary.settings.billing.annual_toggle || "Yearly"}
                  <Badge className="-top-2 -right-4 absolute h-4 border-none bg-green-500/10 px-1 text-[10px] text-green-600">
                    -20%
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-1 shadow-inner">
            {["usd", "eur", "idr"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={cn(
                  "rounded-lg px-4 py-2 font-bold text-xs uppercase transition-all",
                  currency === c
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Pricing Grid */}
        <div className="mt-8 grid w-full grid-cols-1 gap-8 md:grid-cols-3">
          {sortedPlans.map((plan, idx) => {
            const isPro = plan.name.toLowerCase() === "pro";
            const isStarter = plan.name.toLowerCase() === "starter";
            const isCurrent = workspace?.plan_id === plan.id || (workspace?.plan_id === null && isStarter);
            const price = displayPrice(plan, billingCycle, { currency });
            const _savings = annualSavingsPct(plan, currency);
            const priceId = getGatewayPrice(plan, billingCycle, currency);

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={cn(
                  "relative flex h-full flex-col rounded-[2.5rem] border p-8 transition-all duration-300",
                  isPro
                    ? "z-10 scale-105 border-primary/20 bg-primary/5 shadow-primary/5 shadow-xl"
                    : "border-border bg-card shadow-sm hover:shadow-md",
                  isCurrent && "ring-2 ring-primary ring-offset-4 ring-offset-background",
                )}
              >
                {isPro && (
                  <div className="-top-4 -translate-x-1/2 absolute left-1/2 rounded-full bg-primary px-4 py-1.5 font-black text-[10px] text-primary-foreground uppercase tracking-widest shadow-lg">
                    {dictionary.settings.billing.highest_value || "Highest Value"}
                  </div>
                )}

                <div className="flex-1 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="rounded-2xl border bg-background p-3 shadow-sm">
                      {planIcons[plan.name.toLowerCase()] || <Rocket className="h-6 w-6 text-primary" />}
                    </div>
                    {isCurrent && (
                      <Badge variant="secondary" className="px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
                        {dictionary.settings.billing.current_plan || "Current Plan"}
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h3 className="font-black text-2xl text-foreground">{plan.name}</h3>
                    <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                      {plan.description || "The essentials to get you started."}
                    </p>
                  </div>

                  <div className="border-border/50 border-y pt-4 pb-2">
                    <div className="flex items-baseline gap-1">
                      <span className="font-black text-4xl tracking-tighter md:text-5xl">{price?.label}</span>
                      {plan.name.toLowerCase() !== "starter" && (
                        <span className="font-semibold text-lg text-muted-foreground">
                          {price.note?.includes("billed annually") ? "/mo" : "/mo"}
                        </span>
                      )}
                    </div>
                    {billingCycle === "annual" &&
                      (plan.prices.find((p) => p.currency === currency)?.yearly ?? 0) > 0 && (
                        <p className="mt-1.5 font-medium text-muted-foreground/80 text-xs italic">
                          Billed as{" "}
                          {
                            displayPrice(plan, "annual", {
                              compact: false,
                              currency,
                            }).label
                          }
                          /year
                        </p>
                      )}
                  </div>

                  <div className="space-y-4 pt-4">
                    <p className="tracking_widest font-black text-foreground/70 text-xs uppercase">
                      {dictionary.settings.billing.whats_included || "What's included:"}
                    </p>
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-2.5 w-2.5 stroke-[4px] text-primary" />
                        </div>
                        <span className="font-medium text-muted-foreground/90 text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10">
                  <Button
                    size="lg"
                    className={cn(
                      "h-14 w-full rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98]",
                      isPro
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                        : "bg-foreground text-background shadow-black/10 shadow-lg hover:bg-foreground/90",
                      isCurrent && "scale-100 cursor-default border-transparent bg-muted text-muted-foreground",
                    )}
                    onClick={() => {
                      if (isCurrent || !priceId) return;
                      checkoutMutation.mutate(priceId);
                    }}
                    disabled={
                      checkoutMutation.isPending || isCurrent || (!priceId && plan.name.toLowerCase() !== "starter")
                    }
                  >
                    {isCurrent
                      ? dictionary.settings.billing.current_plan || "Your Active Plan"
                      : checkoutMutation.isPending
                        ? dictionary.common.connecting || "Connecting..."
                        : plan.name.toLowerCase() === "starter"
                          ? dictionary.settings.billing.selected_plan || "Selected Plan"
                          : dictionary.common.coming_soon || "Coming Soon"}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Guarantee & FAQ */}
      <div className="mx-auto w-full max-w-4xl space-y-24 pt-16">
        <div className="grid grid-cols-1 gap-8 border-border/50 border-y py-16 text-center md:grid-cols-3">
          <div className="space-y-2">
            <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
            <h4 className="font-bold">Secure Checkout</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">Encrypted payments processed via Mayar.</p>
          </div>
          <div className="space-y-2">
            <Sparkles className="mx-auto h-8 w-8 text-primary" />
            <h4 className="font-bold">Instant Upgrade</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Features unlocked immediately after checkout.
            </p>
          </div>
          <div className="space-y-2">
            <Info className="mx-auto h-8 w-8 text-primary" />
            <h4 className="font-bold">Flexible Billing</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Cancel or switch plans anytime in settings?.
            </p>
          </div>
        </div>

        <div className="space-y-12">
          <div className="space-y-4 text-center">
            <h2 className="font-black text-3xl tracking-tight">
              {dictionary.settings.faq.title || "Frequently Asked Questions"}
            </h2>
            <p className="text-muted-foreground">
              {dictionary.settings.faq.description || "Everything you need to know about our plans."}
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-b px-0">
              <AccordionTrigger className="py-6 text-left font-bold text-lg hover:no-underline">
                Can I switch between monthly and yearly?
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                Yes, you can switch your billing cycle at any time from your workspace settings?. Switching to annual
                billing mid-period will convert your remaining time into credit.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-b px-0">
              <AccordionTrigger className="py-6 text-left font-bold text-lg hover:no-underline">
                What happens if I cancel my subscription?
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                If you cancel, you'll still have full access to your paid features until the end of your already paid
                billing period. After that, your workspace will revert to the Starter plan.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="border-b px-0">
              <AccordionTrigger className="py-6 text-left font-bold text-lg hover:no-underline">
                Is my data safe and exportable?
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-base text-muted-foreground leading-relaxed">
                Absolutely. We take data security very seriously. All your financial records are encrypted and you can
                export all your data in CSV or PDF format at any time.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
