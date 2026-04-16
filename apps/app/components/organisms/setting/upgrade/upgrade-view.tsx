"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  cn,
} from "@workspace/ui";
import { Check } from "lucide-react";
import type { Pricing } from "@workspace/types";
import {
  createCheckoutSession,
  cancelSubscription,
} from "@workspace/modules/mayar/mayar.action";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app";
import { Separator } from "@workspace/ui";
import { displayPrice, getGatewayPrice } from "@workspace/utils";

export function UpgradeView({ initialPlans }: { initialPlans: Pricing[] }) {
  const { workspace, settings, dictionary } = useAppStore() as any;
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">(
    "monthly",
  );

  const currency = settings?.mainCurrencyCode?.toLowerCase() || "usd";
  const workspaceId = workspace?.id;
  const dict = dictionary?.settings?.billing || dictionary?.billing;
  const currentPlanId = workspace?.plan_id;

  const checkoutMutation = useMutation({
    mutationFn: async (params: {
      priceId: string;
      type?: "subscription" | "payment";
    }) => {
      const result = await createCheckoutSession(
        params.priceId,
        workspaceId,
        "/settings/billing",
        params.type,
        undefined, // addonType
        undefined, // amount
        undefined, // addonId
        billingCycle,
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: any) => toast.error(error.message),
  });

  const downgradeMutation = useMutation({
    mutationFn: async () => {
      const result = await cancelSubscription();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Subscription scheduled for cancellation");
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (!dict) return null;

  const sortedPlans = [...(initialPlans || [])].sort((a, b) => {
    const order = ["starter", "pro", "business"];
    return (
      order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase())
    );
  });

  return (
    <div className="space-y-8 max-w-3xl mx-auto mt-10">
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-medium tracking-tight">
          {dict.available_plans}
        </h2>
        <p className="text-base text-muted-foreground">
          {dict.choose_plan_description ||
            "Choose the plan that best fits your needs."}
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between pb-2">
          <div className=""></div>
          <div className="flex border bg-background">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "px-4 py-1.5 text-[10px] uppercase tracking-wider transition-all font-medium",
                billingCycle === "monthly"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent/5",
              )}
            >
              {dict.monthly_toggle}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("annual")}
              className={cn(
                "px-4 py-1.5 text-[10px] uppercase tracking-wider transition-all border-l font-medium",
                billingCycle === "annual"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent/5",
              )}
            >
              {dict.annual_toggle}
            </button>
          </div>
        </div>

        {sortedPlans.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center border -dashed rounded-none bg-accent/5">
            {dict.no_plans}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sortedPlans.map((plan, i) => {
              const isCurrent = currentPlanId === plan.id;
              const isStarter = plan.name.toLowerCase() === "starter";
              const canDowngrade =
                isStarter && workspace?.mayar_transaction_id;

              const price = displayPrice(plan, billingCycle, {
                currency,
                compact: true,
              });
              const priceId = getGatewayPrice(plan, billingCycle, currency);

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "rounded-none shadow-none flex flex-col transition-all border group relative",
                    isCurrent && "border-foreground ring-1 ring-foreground/10",
                    !isCurrent &&
                      "hover:border-foreground/40 hover:bg-accent/5",
                    i == 1 && "md:scale-105",
                  )}
                >
                  <CardHeader className="p-5 pb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <CardTitle className="text-sm font-medium tracking-tight uppercase group-hover:text-primary transition-colors">
                        {plan.name}
                      </CardTitle>
                      {isCurrent && (
                        <Badge
                          variant="outline"
                          className="rounded-none text-[9px] uppercase tracking-widest px-1.5 py-0 border-foreground bg-foreground text-background font-semibold"
                        >
                          {dictionary?.settings?.common?.current || "Current"}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs line-clamp-2 leading-relaxed h-10">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 pt-0 flex-1 space-y-6">
                    <div className="flex items-baseline gap-1 pt-4 border-t">
                      <span className="text-2xl font-serif tracking-tight font-medium">
                        {price.label}
                      </span>
                      {plan.name.toLowerCase() !== "starter" && (
                        <span className="text-xs text-muted-foreground font-medium">
                          / {billingCycle === "monthly" ? dict.mo : dict.yr}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2.5">
                      {(plan.features || [])
                        .slice(0, 10)
                        .map((feature: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2.5 text-[11px] text-muted-foreground leading-snug"
                          >
                            <Check className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="p-5 pt-0">
                    <Button
                      className={cn(
                        "w-full h-9 text-[10px] uppercase tracking-widest rounded-none font-semibold transition-all",
                        isCurrent && !canDowngrade
                          ? "bg-muted text-muted-foreground border-transparent"
                          : "shadow-sm",
                      )}
                      variant={
                        isCurrent && !canDowngrade ? "secondary" : "default"
                      }
                      disabled={
                        (isCurrent && !canDowngrade) ||
                        checkoutMutation.isPending ||
                        downgradeMutation.isPending ||
                        (!priceId && !isStarter)
                      }
                      onClick={() => {
                        if (canDowngrade) {
                          if (confirm(dict.downgrade_confirm)) {
                            downgradeMutation.mutate();
                          }
                        } else if (!isCurrent && priceId) {
                          checkoutMutation.mutate({ priceId, type: "subscription" });
                        }
                      }}
                    >
                      {isCurrent ? (
                        canDowngrade ? (
                          dict.upgrade
                        ) : (
                          dict.current_plan
                        )
                      ) : canDowngrade ? (
                        downgradeMutation.isPending ? (
                          dictionary?.settings?.common?.processing || "Processing..."
                        ) : (
                          dict.upgrade
                        )
                      ) : checkoutMutation.isPending ? (
                        dictionary?.settings?.common?.connecting || "Connecting..."
                      ) : isStarter ? (
                        dict.free_plan
                      ) : (
                        dict.get_started
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
