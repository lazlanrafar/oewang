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
} from "@workspace/modules/xendit/xendit.action";
import { getBillingHistory } from "@workspace/modules/orders/orders.action";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app";
import { Separator } from "@workspace/ui";
import {
  formatBytes,
  displayPrice,
  getPlanLimits,
  getGatewayPrice,
} from "@workspace/utils";
import Link from "next/link";
import { useLocalizedRoute } from "@/utils/localized-route";

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

export function BillingView({ 
  initialPlans,
  initialAddons = []
}: { 
  initialPlans: Pricing[];
  initialAddons?: Pricing[];
}) {
  const {
    workspace,
    settings,
    dictionary,
    isLoading: isDictLoading,
  } = useAppStore() as any;
  const [billingCycle, setBillingCycle] = React.useState<"monthly" | "annual">(
    "monthly",
  );
  const [history, setHistory] = React.useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  const { getLocalizedUrl } = useLocalizedRoute();
  const currency = settings?.mainCurrencyCode?.toLowerCase() || "usd";

  const workspaceId = workspace?.id;

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
    mutationFn: async (params: {
      priceId?: string | null;
      type?: "subscription" | "payment";
      addonId?: string;
      addonType?: "ai" | "vault";
      amount?: number;
    }) => {
      const result = await createCheckoutSession(
        params.priceId,
        workspaceId,
        "/settings/billing",
        params.type,
        params.addonType,
        params.amount,
        params.addonId,
      );
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

  const dict = dictionary?.settings?.billing || dictionary?.billing;
  
  if (!dict || !dict.history) {
    return <BillingSkeleton />;
  }

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

  const { vaultLimitBytes, aiLimitTokens } = getPlanLimits(currentPlan, {
    extra_vault_size_mb: workspace?.extra_vault_size_mb,
    extra_ai_tokens: workspace?.extra_ai_tokens,
  });
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

      {/* Current Plan Hero Card */}
      <Card className="rounded-none shadow-none border bg-accent/5 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <Zap className="h-32 w-32" />
        </div>
        <CardHeader className="p-6 pb-2 relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <Badge
                variant="outline"
                className="rounded-none text-[10px] uppercase tracking-widest px-2 h-5 font-semibold bg-background border"
              >
                {dict.current_plan}
              </Badge>
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-medium tracking-tight">
                  {currentPlan.name}
                </h3>
                {workspace?.xendit_subscription_id && (
                  <Badge
                    variant="secondary"
                    className="rounded-none text-[9px] h-4 px-1.5 font-medium tracking-wide uppercase bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  >
                    {dictionary.settings.common.active}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-3xl font-serif tracking-tight font-medium">
                  {displayPrice(currentPlan, billingCycle, { currency }).label}
                </span>
                {currentPlan.name.toLowerCase() !== "starter" && (
                  <span className="text-xs text-muted-foreground uppercase">
                    / {billingCycle === "monthly" ? dict.mo : dict.yr}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                {billingCycle === "annual" ? dict.annual_toggle : dict.monthly_toggle}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-2 pb-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                {currentPlan.description}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {(currentPlan.features || []).slice(0, 8).map((feature: string, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="truncate">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-end gap-3 sm:flex-row h-fit self-end">
              {workspace?.xendit_subscription_id ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                    className="rounded-none text-xs h-9 px-6 font-normal bg-background border hover:bg-accent/5 transition-colors"
                  >
                    <CreditCard className="mr-2 h-3.5 w-3.5" />
                    {portalMutation.isPending
                      ? dictionary.settings.common.opening
                      : dict.manage_subscription}
                  </Button>
                  <Button
                    asChild
                    className="rounded-none text-xs h-9 px-6 font-medium shadow-sm"
                  >
                    <Link href={getLocalizedUrl("/upgrade")}>
                        {dict.upgrade || "Upgrade Plan"}
                    </Link>
                  </Button>
                </>
              ) : (
                <Button
                  asChild
                  className="rounded-none text-xs h-9 px-8 font-medium shadow-sm"
                >
                  <Link href={getLocalizedUrl("/upgrade")}>
                    {dict.upgrade || "View Plans"}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Indicators */}
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
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-serif tracking-tight font-medium">
                {formatBytes(vaultUsed)}
                <span className="text-xs font-normal text-muted-foreground ml-1.5 uppercase">
                  / {currentPlan.max_vault_size_mb} MB
                </span>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">
                {vaultProgress.toFixed(0)}%
              </span>
            </div>
            <div className="space-y-2">
              <Progress
                value={vaultProgress}
                className="h-1 rounded-none bg-muted/40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                <span>{dictionary.settings.common.used}</span>
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
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-serif tracking-tight font-medium">
                {aiUsed.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1.5 uppercase">
                  / {currentPlan.max_ai_tokens.toLocaleString()}
                </span>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">
                {aiProgress.toFixed(0)}%
              </span>
            </div>
            <div className="space-y-2">
              <Progress
                value={aiProgress}
                className="h-1 rounded-none bg-muted/40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                <span>{dictionary.settings.common.used}</span>
                <span>
                  {(aiLimitTokens - aiUsed).toLocaleString()}{" "}
                  {dictionary.settings.common.remaining}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add-ons List (Horizontal Rows) */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {dict.addons || "Monthly Add-ons"}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {initialAddons.map((addon) => {
            const price = displayPrice(addon, "monthly", {
              currency,
              compact: true,
            });
            const priceId = getGatewayPrice(addon, "addon", currency);
            const isActive = workspace?.active_addons?.some((a: any) => a.id === addon.id);

            return (
              <Card key={addon.id} className={cn(
                "rounded-none shadow-none border bg-background hover:bg-accent/5 transition-all p-4",
                isActive && "opacity-80"
              )}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                        "size-10 flex items-center justify-center shrink-0 border",
                        addon.addon_type === "ai" ? "bg-amber-500/5 text-amber-500 border-amber-500/20" : "bg-emerald-500/5 text-emerald-500 border-emerald-500/20"
                    )}>
                        {addon.addon_type === "ai" ? <Zap className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium tracking-tight">
                            {addon.name}
                        </span>
                        {isActive && (
                            <Badge variant="secondary" className={cn(
                            "rounded-none text-[8px] h-3.5 px-1 font-mono uppercase",
                            addon.addon_type === "ai" ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"
                            )}>
                            {dictionary?.settings?.common?.active || "Active"}
                            </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 max-w-md">
                        {addon.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-10">
                    <div className="text-right whitespace-nowrap">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium mb-0.5">
                            {addon.addon_type === "ai" ? "Quota" : "Storage"}
                        </p>
                        <p className="text-xs font-serif font-medium">
                            {addon.addon_type === "ai" 
                            ? `+${addon.max_ai_tokens?.toLocaleString()}`
                            : `+${addon.max_vault_size_mb} MB`
                            }
                        </p>
                    </div>
                    
                    <div className="text-right whitespace-nowrap min-w-[80px]">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium mb-0.5">
                            {dict.price || "Price"}
                        </p>
                        <p className="text-xs font-serif font-medium">
                            {price.label} <span className="text-[9px] font-normal text-muted-foreground">/ {dict.mo}</span>
                        </p>
                    </div>

                    <Button 
                      size="sm" 
                      variant={isActive ? "outline" : "default"}
                      className="rounded-none text-[10px] uppercase tracking-widest h-8 px-5"
                      disabled={true}
                    >
                      {isActive ? (dictionary?.settings?.common?.active || "Active") : (dictionary?.settings?.common?.coming_soon || "Coming Soon")}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Billing history */}
      <div className="space-y-6">
        <div className="border-b pb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            {dict.history?.title}
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
                          {order.xendit_invoice_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-3 text-[10px] uppercase tracking-widest rounded-none border font-medium hover:bg-foreground hover:text-background transition-all"
                              onClick={() =>
                                downloadMutation.mutate(
                                  order.xendit_invoice_id!,
                                )
                              }
                              disabled={downloadMutation.isPending}
                            >
                              {downloadMutation.isPending &&
                              downloadMutation.variables ===
                                order.xendit_invoice_id
                                ? "..."
                                : (dictionary?.settings?.common?.view_pdf || "View PDF")}
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
                <div className="size-12 rounded-none border-dashed flex items-center justify-center mx-auto mb-4 opacity-50">
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
