"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  cn,
  Badge,
} from "@workspace/ui";
import { Check, Info, Sparkles, Rocket, Zap, ShieldCheck } from "lucide-react";
import { getPricing } from "@workspace/modules/pricing/pricing.action";
import { createCheckoutSession } from "@workspace/modules/xendit/xendit.action";
import { toast } from "sonner";
import {
  displayPrice,
  getGatewayPrice,
  annualSavingsPct,
} from "@workspace/utils";
import { useAppStore } from "@/stores/app";
import { motion } from "framer-motion";

interface UpgradeClientProps {
  dictionary: any;
}

const planIcons: Record<string, React.ReactNode> = {
  starter: <Rocket className="h-6 w-6 text-blue-500" />,
  pro: <Zap className="h-6 w-6 text-amber-500" />,
  business: <ShieldCheck className="h-6 w-6 text-purple-500" />,
};

export function UpgradeClient({ dictionary }: UpgradeClientProps) {
  const { workspace, settings } = useAppStore();
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">(
    "annual",
  );
  const [currency, setCurrency] = React.useState(
    settings?.mainCurrencyCode?.toLowerCase() || "usd",
  );

  React.useEffect(() => {
    if (settings?.mainCurrencyCode) {
      setCurrency(settings.mainCurrencyCode.toLowerCase());
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
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-16 space-y-12">
        <div className="text-center space-y-4">
          <Skeleton className="h-12 w-64 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
    <div className="max-w-7xl mx-auto w-full px-6 py-16 md:py-24 space-y-16">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 text-primary text-xs font-bold tracking-wider uppercase mb-2">
          <Sparkles className="h-3.5 w-3.5" />
          Special Launch Pricing
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight text-foreground">
          Scale your finances with Oewang
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Choose the plan that fits your current needs. Start small and grow as
          your business scales.
        </p>
      </motion.div>

      {/* Controls */}
      <div className="flex flex-col items-center space-y-8">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="bg-muted/50 p-1 rounded-xl inline-flex shadow-inner">
            <Tabs
              value={billingCycle}
              onValueChange={(v) => setBillingCycle(v as any)}
              className="w-auto"
            >
              <TabsList className="bg-transparent h-10 gap-1">
                <TabsTrigger
                  value="monthly"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 py-2 text-sm font-medium rounded-lg transition-all"
                >
                  Monthly
                </TabsTrigger>
                <TabsTrigger
                  value="annual"
                  className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6 py-2 text-sm font-medium rounded-lg transition-all relative"
                >
                  Yearly
                  <Badge className="absolute -top-2 -right-4 bg-green-500/10 text-green-600 border-none text-[10px] h-4 px-1">
                    -20%
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-xl shadow-inner">
            {["usd", "eur", "idr"].map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "px-4 py-2 text-xs font-bold uppercase rounded-lg transition-all",
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mt-8">
          {sortedPlans.map((plan, idx) => {
            const isPro = plan.name.toLowerCase() === "pro";
            const isCurrent = workspace?.plan_id === plan.id;
            const price = displayPrice(plan, billingCycle, { currency });
            const savings = annualSavingsPct(plan, currency);
            const priceId = getGatewayPrice(plan, billingCycle, currency);

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={cn(
                  "relative flex flex-col h-full rounded-[2.5rem] border p-8 transition-all duration-300",
                  isPro
                    ? "border-primary/20 bg-primary/5 shadow-xl shadow-primary/5 scale-105 z-10"
                    : "border-border bg-card shadow-sm hover:shadow-md",
                  isCurrent &&
                    "ring-2 ring-primary ring-offset-4 ring-offset-background",
                )}
              >
                {isPro && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest shadow-lg">
                    Highest Value
                  </div>
                )}

                <div className="space-y-6 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="p-3 rounded-2xl bg-background border shadow-sm">
                      {planIcons[plan.name.toLowerCase()] || (
                        <Rocket className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    {isCurrent && (
                      <Badge
                        variant="secondary"
                        className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
                      >
                        Current Plan
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-foreground">
                      {plan.name}
                    </h3>
                    <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
                      {plan.description || "The essentials to get you started."}
                    </p>
                  </div>

                  <div className="pt-4 pb-2 border-y border-border/50">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl md:text-5xl font-black tracking-tighter">
                        {price.label}
                      </span>
                      {plan.name.toLowerCase() !== "starter" && (
                        <span className="text-muted-foreground font-semibold text-lg">
                          {price.note?.includes("billed annually")
                            ? "/mo"
                            : "/mo"}
                        </span>
                      )}
                    </div>
                    {billingCycle === "annual" &&
                      plan.prices.find((p) => p.currency === currency)
                        ?.yearly! > 0 && (
                        <p className="text-xs text-muted-foreground/80 mt-1.5 font-medium italic">
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
                    <p className="text-xs font-black uppercase tracking-widest text-foreground/70">
                      What's included:
                    </p>
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="mt-1 h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <Check className="h-2.5 w-2.5 text-primary stroke-[4px]" />
                        </div>
                        <span className="text-sm text-muted-foreground/90 font-medium">
                          {feature}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-10">
                  <Button
                    size="lg"
                    className={cn(
                      "w-full h-14 text-sm font-black rounded-2xl transition-all active:scale-[0.98] uppercase tracking-wider",
                      isPro
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                        : "bg-foreground text-background hover:bg-foreground/90 shadow-lg shadow-black/10",
                      isCurrent &&
                        "bg-muted text-muted-foreground border-transparent cursor-default scale-100",
                    )}
                    onClick={() => {
                      if (isCurrent || !priceId) return;
                      checkoutMutation.mutate(priceId);
                    }}
                    disabled={
                      checkoutMutation.isPending ||
                      isCurrent ||
                      (!priceId && plan.name.toLowerCase() !== "starter")
                    }
                  >
                    {isCurrent
                      ? "Your Active Plan"
                      : checkoutMutation.isPending
                        ? "Connecting..."
                        : plan.name.toLowerCase() === "starter"
                          ? "Selected Plan"
                          : (dictionary?.settings?.common?.coming_soon || "Coming Soon")}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Guarantee & FAQ */}
      <div className="max-w-4xl mx-auto w-full pt-16 space-y-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center border-y border-border/50 py-16">
          <div className="space-y-2">
            <ShieldCheck className="h-8 w-8 mx-auto text-primary" />
            <h4 className="font-bold">Secure Checkout</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Encrypted payments processed via Xendit.
            </p>
          </div>
          <div className="space-y-2">
            <Sparkles className="h-8 w-8 mx-auto text-primary" />
            <h4 className="font-bold">Instant Upgrade</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Features unlocked immediately after checkout.
            </p>
          </div>
          <div className="space-y-2">
            <Info className="h-8 w-8 mx-auto text-primary" />
            <h4 className="font-bold">Flexible Billing</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cancel or switch plans anytime in settings.
            </p>
          </div>
        </div>

        <div className="space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-black tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about our plans.
            </p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="item-1" className="border-b px-0">
              <AccordionTrigger className="text-lg font-bold py-6 hover:no-underline text-left">
                Can I switch between monthly and yearly?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-6 text-base leading-relaxed">
                Yes, you can switch your billing cycle at any time from your
                workspace settings. Switching to annual billing mid-period will
                convert your remaining time into credit.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-b px-0">
              <AccordionTrigger className="text-lg font-bold py-6 hover:no-underline text-left">
                What happens if I cancel my subscription?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-6 text-base leading-relaxed">
                If you cancel, you'll still have full access to your paid
                features until the end of your already paid billing period.
                After that, your workspace will revert to the Starter plan.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="border-b px-0">
              <AccordionTrigger className="text-lg font-bold py-6 hover:no-underline text-left">
                Is my data safe and exportable?
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-6 text-base leading-relaxed">
                Absolutely. We take data security very seriously. All your
                financial records are encrypted and you can export all your data
                in CSV or PDF format at any time.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}
