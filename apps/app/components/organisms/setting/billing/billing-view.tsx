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
  Skeleton,
  Progress,
  Badge,
  cn,
} from "@workspace/ui";
import { Check, Zap, CreditCard, Shield } from "lucide-react";
import type { Pricing, Order } from "@workspace/types";
import {
  createCheckoutSession,
  createCustomerPortal,
  cancelSubscription,
  getInvoiceUrl,
} from "@workspace/modules/stripe/stripe.action";
import { getBillingHistory } from "@workspace/modules/orders/orders.action";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app";
import { Separator } from "@workspace/ui";
import {
  formatBytes,
  displayPrice,
  getPlanLimits,
  getStripePrice,
} from "@workspace/utils";

function BillingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48 rounded-none" />
        <Skeleton className="h-4 w-72 rounded-none" />
      </div>
      <Separator className="rounded-none" />

      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-32 w-full rounded-none" />
        <Skeleton className="h-32 w-full rounded-none" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border pb-2">
          <Skeleton className="h-4 w-32 rounded-none" />
          <Skeleton className="h-8 w-40 rounded-none" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function BillingView({ initialPlans }: { initialPlans: Pricing[] }) {
  const {
    workspace,
    settings,
    dictionary,
    isLoading: isDictLoading,
  } = useAppStore();
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">(
    "monthly",
  );
  const [history, setHistory] = React.useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  const currency = settings?.mainCurrencyCode?.toLowerCase() || "usd";

  React.useEffect(() => {
    async function fetchHistory() {
      const result = await getBillingHistory();
      if (result.success) {
        setHistory(result.data);
      }
      setLoadingHistory(false);
    }
    fetchHistory();
  }, []);

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const result = await createCheckoutSession(priceId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: any) => toast.error(error.message),
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const result = await createCustomerPortal();
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

  const downloadMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const result = await getInvoiceUrl(invoiceId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (error: any) => toast.error(error.message),
  });

  if (!dictionary || isDictLoading) {
    return <BillingSkeleton />;
  }

  const dict = dictionary.settings.billing;

  const currentPlanId = workspace?.plan_id;
  const vaultUsed = workspace?.vault_size_used_bytes || 0;
  const aiUsed = workspace?.ai_tokens_used || 0;

  const currentPlan = (initialPlans?.find((p) => p.id === currentPlanId) || {
    name: "Starter",
    max_vault_size_mb: 50,
    max_ai_tokens: 50,
    features: [],
    prices: [],
  }) as Pricing;

  const { vaultLimitBytes, aiLimitTokens } = getPlanLimits(currentPlan);
  const vaultProgress = Math.min(100, (vaultUsed / vaultLimitBytes) * 100);
  const aiProgress = Math.min(100, (aiUsed / aiLimitTokens) * 100);

  const sortedPlans = [...(initialPlans || [])].sort((a, b) => {
    const order = ["starter", "pro", "business"];
    return (
      order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase())
    );
  });

  return (
    <div className="space-y-8 pb-10">
      <div className="space-y-1">
        <h2 className="text-lg font-medium tracking-tight">{dict.title}</h2>
        <p className="text-xs text-muted-foreground">{dict.description}</p>
      </div>

      <Separator className="rounded-none" />

      {/* Current Plan + Manage */}
      <div className="flex items-center justify-between bg-accent/5 p-4 border border rounded-none relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Zap className="h-20 w-20" />
        </div>
        <div className="space-y-0.5 relative z-10">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest leading-none mb-1">
            {dict.current_plan}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-medium tracking-tight">
              {currentPlan.name}
            </p>
            {workspace?.stripe_subscription_id && (
              <Badge
                variant="secondary"
                className="rounded-none text-[9px] h-4 px-1.5 font-normal tracking-wide uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                {dictionary.settings.common.active}
              </Badge>
            )}
          </div>
        </div>
        <div className="relative z-10">
          {workspace?.stripe_subscription_id ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="rounded-none text-xs h-8 font-normal bg-background border hover:bg-accent/5 transition-colors"
            >
              <CreditCard className="mr-2 h-3.5 w-3.5" />
              {portalMutation.isPending
                ? dictionary.settings.common.opening
                : dict.manage_subscription}
            </Button>
          ) : (
            <Badge
              variant="outline"
              className="rounded-none text-[10px] uppercase tracking-wider px-3 h-8 font-normal border bg-background"
            >
              {dict.free_plan}
            </Badge>
          )}
        </div>
      </div>

      {/* Usage */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Vault */}
        <Card className="rounded-none shadow-none border bg-background">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              {dict.vault_storage || "Vault Storage"}
              <Shield className="h-3.5 w-3.5 text-muted-foreground/50" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="text-2xl font-serif tracking-tight font-medium">
              {formatBytes(vaultUsed)}
              <span className="text-sm font-normal text-muted-foreground ml-1.5">
                / {currentPlan.max_vault_size_mb} MB
              </span>
            </div>
            <div className="space-y-2">
              <Progress
                value={vaultProgress}
                className="h-1 rounded-none bg-muted/40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                <span>
                  {vaultProgress.toFixed(1)}% {dictionary.settings.common.used}
                </span>
                <span>
                  {formatBytes(vaultLimitBytes - vaultUsed)}{" "}
                  {dictionary.settings.common.remaining}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Tokens */}
        <Card className="rounded-none shadow-none border bg-background">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center justify-between">
              {dict.ai_tokens || "AI Tokens"}
              <Zap className="h-3.5 w-3.5 text-muted-foreground/50" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="text-2xl font-serif tracking-tight font-medium">
              {aiUsed.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-1.5">
                / {currentPlan.max_ai_tokens.toLocaleString()}
              </span>
            </div>
            <div className="space-y-2">
              <Progress
                value={aiProgress}
                className="h-1 rounded-none bg-muted/40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                <span>
                  {aiProgress.toFixed(1)}% {dictionary.settings.common.used}
                </span>
                <span>
                  {(aiLimitTokens - aiUsed).toLocaleString()}{" "}
                  {dictionary.settings.common.remaining}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b pb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {dict.available_plans}
          </p>
          {/* Billing cycle toggle */}
          <div className="flex border border bg-background">
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
                "px-4 py-1.5 text-[10px] uppercase tracking-wider transition-all border-l border font-medium",
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
          <p className="text-xs text-muted-foreground py-8 text-center border border-dashed rounded-none bg-accent/5">
            {dict.no_plans}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sortedPlans.map((plan) => {
              const isCurrent = workspace?.plan_id === plan.id;
              const isStarter = plan.name.toLowerCase() === "starter";
              const canDowngrade =
                isStarter && workspace?.stripe_subscription_id;

              const price = displayPrice(plan, billingCycle, {
                currency,
                compact: true,
              });
              const priceId = getStripePrice(plan, billingCycle, currency);

              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "rounded-none shadow-none flex flex-col transition-all border group relative",
                    isCurrent && "border-foreground ring-1 ring-foreground/10",
                    !isCurrent &&
                      "hover:border-foreground/40 hover:bg-accent/5",
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
                          {dictionary.settings.common.current}
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
                        .slice(0, 6)
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
                          checkoutMutation.mutate(priceId);
                        }
                      }}
                    >
                      {isCurrent
                        ? canDowngrade
                          ? dict.upgrade
                          : dict.current_plan
                        : canDowngrade
                          ? downgradeMutation.isPending
                            ? dictionary.settings.common.processing
                            : dict.upgrade
                          : checkoutMutation.isPending
                            ? dictionary.settings.common.connecting
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

      {/* Billing history */}
      <div className="space-y-6">
        <div className="border-b pb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {dict.history.title}
          </p>
        </div>
        <Card className="rounded-none shadow-none border overflow-hidden bg-background">
          <CardContent className="p-0">
            {loadingHistory ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-none" />
                ))}
              </div>
            ) : history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b bg-accent/5 uppercase tracking-widest font-semibold text-muted-foreground/80">
                      <th className="p-4 font-semibold text-[10px]">
                        {dict.history.date}
                      </th>
                      <th className="p-4 font-semibold text-[10px]">
                        {dict.history.invoice}
                      </th>
                      <th className="p-4 font-semibold text-[10px]">
                        {dict.history.amount}
                      </th>
                      <th className="p-4 font-semibold text-[10px]">
                        {dict.history.status}
                      </th>
                      <th className="p-4 font-semibold text-[10px] text-right">
                        {dict.history.action}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted/40">
                    {history.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-accent/5 transition-all group"
                      >
                        <td className="p-4 text-muted-foreground font-medium">
                          {new Date(order.created_at).toLocaleDateString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </td>
                        <td className="p-4 font-medium tracking-tight">
                          {order.code}
                        </td>
                        <td className="p-4 font-serif text-xs">
                          {(order.amount / 100).toLocaleString(undefined, {
                            style: "currency",
                            currency: order.currency,
                          })}
                        </td>
                        <td className="p-4">
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-none text-[9px] uppercase font-semibold px-2 py-0.5 border",
                              order.status.toLowerCase() === "paid"
                                ? "text-emerald-500 bg-emerald-500/5 border-emerald-500/20"
                                : "text-muted-foreground",
                            )}
                          >
                            {order.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          {order.stripe_invoice_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-[10px] uppercase tracking-widest rounded-none border font-medium hover:bg-foreground hover:text-background transition-all"
                              onClick={() =>
                                downloadMutation.mutate(
                                  order.stripe_invoice_id!,
                                )
                              }
                              disabled={downloadMutation.isPending}
                            >
                              {downloadMutation.isPending &&
                              downloadMutation.variables ===
                                order.stripe_invoice_id
                                ? "..."
                                : dictionary.settings.common.view_pdf}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-16 text-center bg-accent/5">
                <div className="size-12 rounded-none border border-dashed border flex items-center justify-center mx-auto mb-4 opacity-50">
                  <CreditCard className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1">
                  {dict.history.no_history}
                </p>
                <p className="text-[11px] text-muted-foreground max-w-[200px] mx-auto leading-relaxed">
                  {dict.history.no_history_description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
