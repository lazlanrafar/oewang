"use client";

import * as React from "react";

import { useMutation } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { cancelSubscription, createCheckoutSession } from "@workspace/modules/mayar/mayar.action";
import type { Pricing } from "@workspace/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@workspace/ui";
import { displayPrice, getGatewayPrice } from "@workspace/utils";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { useAppStore } from "@/stores/app";

export function UpgradeView({
  initialPlans,
  locale,
  dictionary,
}: {
  initialPlans: Pricing[];
  locale: string;
  dictionary: Dictionary;
}) {
  const { workspace, settings } = useAppStore() as {
    workspace?: { id?: string; plan_id?: string | null; mayar_transaction_id?: string | null };
    settings?: { mainCurrencyCode?: string };
  };
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">("monthly");
  const confirm = useConfirm();

  const currency = settings?.mainCurrencyCode?.toLowerCase() || "usd";
  const workspaceId = workspace?.id;
  const dict = dictionary.settings.billing;
  const currentPlanId = workspace?.plan_id;

  const checkoutMutation = useMutation({
    mutationFn: async (params: { priceId: string; type?: "subscription" | "payment" }) => {
      const result = await createCheckoutSession(
        params.priceId,
        workspaceId,
        "/settings/billing",
        params.type,
        undefined, // addonType
        undefined, // amount
        undefined, // addonId
        billingCycle,
        locale,
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Something went wrong"),
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
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Something went wrong"),
  });

  if (!dict) return null;

  const sortedPlans = [...(initialPlans || [])].sort((a, b) => {
    const order = ["starter", "pro", "business"];
    return order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase());
  });

  return (
    <div className="mx-auto mt-10 max-w-3xl space-y-8">
      <div className="space-y-1 text-center">
        <h2 className="font-medium text-2xl tracking-tight">{dict.available_plans}</h2>
        <p className="text-base text-muted-foreground">
          {dict.choose_plan_description || "Choose the plan that best fits your needs."}
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between pb-2">
          <div className="" />
          <div className="flex border bg-background">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "px-4 py-1.5 font-medium text-[10px] uppercase tracking-wider transition-all",
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
                "border-l px-4 py-1.5 font-medium text-[10px] uppercase tracking-wider transition-all",
                billingCycle === "annual" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent/5",
              )}
            >
              {dict.annual_toggle}
            </button>
          </div>
        </div>

        {sortedPlans.length === 0 ? (
          <p className="-dashed rounded-none border bg-accent/5 py-8 text-center text-muted-foreground text-xs">
            {dict.no_plans}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {sortedPlans.map((plan, i) => {
              const isStarter = plan.name.toLowerCase() === "starter";
              const isCurrent = currentPlanId === plan.id || (currentPlanId === null && isStarter);
              const canDowngrade = isStarter && workspace?.mayar_transaction_id;

              const price = displayPrice(plan, billingCycle, {
                currency,
                compact: true,
              });
              const priceId = getGatewayPrice(plan, billingCycle, currency);

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "group relative flex flex-col rounded-none border shadow-none transition-all",
                    isCurrent && "border-foreground ring-1 ring-foreground/10",
                    !isCurrent && "hover:border-foreground/40 hover:bg-accent/5",
                    i === 1 && "md:scale-105",
                  )}
                >
                  <CardHeader className="p-5 pb-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <CardTitle className="font-medium text-sm uppercase tracking-tight transition-colors group-hover:text-primary">
                        {plan.name}
                      </CardTitle>
                      {isCurrent && (
                        <Badge
                          variant="outline"
                          className="rounded-none border-foreground bg-foreground px-1.5 py-0 font-semibold text-[9px] text-background uppercase tracking-widest"
                        >
                          {dictionary.settings.common.current || "Current"}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2 h-10 text-xs leading-relaxed">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-6 p-5 pt-0">
                    <div className="flex items-baseline gap-1 border-t pt-4">
                      <span className="font-medium font-serif text-2xl tracking-tight">{price?.label}</span>
                      {plan.name.toLowerCase() !== "starter" && (
                        <span className="font-medium text-muted-foreground text-xs">
                          / {billingCycle === "monthly" ? dict.mo : dict.yr}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2.5">
                      {(plan.features || []).slice(0, 10).map((feature: string) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-[11px] text-muted-foreground leading-snug"
                        >
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="p-5 pt-0">
                    <Button
                      className={cn(
                        "h-9 w-full rounded-none font-semibold text-[10px] uppercase tracking-widest transition-all",
                        isCurrent && !canDowngrade ? "border-transparent bg-muted text-muted-foreground" : "shadow-sm",
                      )}
                      variant={isCurrent && !canDowngrade ? "secondary" : "default"}
                      disabled={
                        (isCurrent && !canDowngrade) ||
                        checkoutMutation.isPending ||
                        downgradeMutation.isPending ||
                        (!priceId && !isStarter)
                      }
                      onClick={async () => {
                        if (canDowngrade) {
                          const ok = await confirm({
                            title: dict.upgrade,
                            description: dict.downgrade_confirm,
                            confirmLabel: "Confirm",
                            cancelLabel: dictionary.common.cancel,
                            destructive: true,
                          });
                          if (!ok) return;
                          downgradeMutation.mutate();
                        } else if (!isCurrent && priceId) {
                          checkoutMutation.mutate({ priceId, type: "subscription" });
                        }
                      }}
                    >
                      {isCurrent
                        ? canDowngrade
                          ? dict.upgrade
                          : dict.current_plan
                        : canDowngrade
                          ? downgradeMutation.isPending
                            ? dictionary.common.processing || "Processing..."
                            : dict.upgrade
                            : checkoutMutation.isPending
                              ? dictionary.common.connecting || "Connecting..."
                            : isStarter
                              ? dict.free_plan
                              : dict.get_started}
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
