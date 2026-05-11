"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import {
  cancelAddonAction,
  cancelSubscription,
  createCheckoutSession,
  createCustomerPortal,
  getInvoiceUrl,
} from "@workspace/modules/mayar/mayar.action";
import { getBillingHistory } from "@workspace/modules/orders/orders.action";
import type { Order, Pricing } from "@workspace/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Progress,
  Separator,
  Skeleton,
} from "@workspace/ui";
import { displayPrice, formatBytes, getGatewayPrice, getPlanLimits } from "@workspace/utils";
import { AlertCircle, Check, CreditCard, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { useAppStore } from "@/stores/app";
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
        <div className="flex items-center justify-between border border-b pb-2">
          <Skeleton className="h-4 w-32 rounded-none" />
          <Skeleton className="h-8 w-40 rounded-none" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
  initialAddons = [],
  dictionary,
}: {
  initialPlans: Pricing[];
  initialAddons?: Pricing[];
  dictionary: Dictionary;
}) {
  const [mounted, setMounted] = React.useState(false);
  const { workspace, settings } = useAppStore();
  const [billingCycle, _setBillingCycle] = React.useState<"monthly" | "annual">("monthly");
  const [history, setHistory] = React.useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);

  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  React.useEffect(() => {
    setMounted(true);
  }, []);
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
        billingCycle,
      );
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const result = await createCustomerPortal();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const _downgradeMutation = useMutation({
    mutationFn: async () => {
      const result = await cancelSubscription();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Subscription scheduled for cancellation");
    },
    onError: (error: Error) => toast.error(error.message),
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
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelAddonMutation = useMutation({
    mutationFn: async (addonId: string) => {
      const result = await cancelAddonAction(addonId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Add-on scheduled for deactivation");
      queryClient.invalidateQueries({ queryKey: ["workspace", "active"] });
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!mounted || !dictionary) {
    return <BillingSkeleton />;
  }

  const billingDict = dictionary.settings.billing;

  if (!billingDict || !billingDict.history) {
    return <BillingSkeleton />;
  }

  const currentPlanId = workspace?.plan_id;
  const vaultUsed = workspace?.vault_size_used_bytes || 0;
  const aiUsed = workspace?.ai_tokens_used || 0;

  const starterPlan = (initialPlans || []).find((p) => p.name.toLowerCase() === "starter") || {
    name: "Starter",
    max_vault_size_mb: 50,
    max_ai_tokens: 50,
    features: [],
    prices: [],
  };

  const currentPlan = (initialPlans.find((p) => p.id === currentPlanId) || starterPlan) as Pricing;

  const { vaultLimitBytes, aiLimitTokens } = getPlanLimits(currentPlan, {
    extra_vault_size_mb: workspace?.extra_vault_size_mb,
    extra_ai_tokens: workspace?.extra_ai_tokens,
  });
  const vaultProgress = Math.min(100, (vaultUsed / vaultLimitBytes) * 100);
  const aiProgress = Math.min(100, (aiUsed / aiLimitTokens) * 100);
  const isOverStorageLimit = vaultUsed > vaultLimitBytes;
  const _storageViolationAt = workspace?.storage_violation_at ? new Date(workspace?.storage_violation_at) : null;

  const _sortedPlans = [...(initialPlans || [])].sort((a, b) => {
    const order = ["starter", "pro", "business"];
    return order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase());
  });

  return (
    <div className="space-y-8 pb-10">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{billingDict.title}</h2>
        <p className="text-muted-foreground text-xs">{billingDict.description}</p>
      </div>

      <Separator className="rounded-none" />

      {isOverStorageLimit && (
        <Alert variant="destructive" className="rounded-none border-destructive/50 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="font-semibold text-xs uppercase tracking-widest">
            {billingDict.storage_limit_exceeded || "Storage Limit Exceeded"}
          </AlertTitle>
          <AlertDescription className="mt-1 text-[11px] leading-relaxed opacity-90">
            {billingDict.storage_grace_period_desc ||
              "Your workspace is currently over its storage limit. Files will be kept for 30 days before being inactivated and eventually deleted. Please upgrade your plan or free up space to avoid data loss."}
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan Hero Card */}
      <Card className="group relative overflow-hidden rounded-none border bg-accent/5 shadow-none">
        <div className="pointer-events-none absolute top-0 right-0 p-8 opacity-5 transition-opacity group-hover:opacity-10">
          <Zap className="h-32 w-32" />
        </div>
        <CardHeader className="relative z-10 p-6 pb-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="space-y-1">
              <Badge
                variant="outline"
                className="h-5 rounded-none border bg-background px-2 font-semibold text-[10px] uppercase tracking-widest"
              >
                {billingDict.current_plan}
              </Badge>
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-2xl tracking-tight">{currentPlan.name}</h3>
                {workspace?.mayar_transaction_id && (
                  <Badge
                    variant="secondary"
                    className="h-4 rounded-none border-emerald-500/20 bg-emerald-500/10 px-1.5 font-medium text-[9px] text-emerald-600 uppercase tracking-wide"
                  >
                    {dictionary.common.active || "Active"}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-baseline justify-end gap-1">
                <span className="font-medium font-serif text-3xl tracking-tight">
                  {displayPrice(currentPlan, billingCycle, { currency }).label}
                </span>
                {currentPlan.name.toLowerCase() !== "starter" && (
                  <span className="text-muted-foreground text-xs uppercase">
                    / {billingCycle === "monthly" ? billingDict.mo : billingDict.yr}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground uppercase tracking-widest">
                {billingCycle === "annual" ? billingDict.annual_toggle : billingDict.monthly_toggle}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 p-6 pt-2 pb-6">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <p className="max-w-sm text-muted-foreground text-xs leading-relaxed">{currentPlan.description}</p>
              <ul className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                {(currentPlan.features || []).slice(0, 8).map((feature: string) => (
                  <li key={feature} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex h-fit flex-col justify-end gap-3 self-end sm:flex-row">
              {workspace?.mayar_transaction_id ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                    className="h-9 rounded-none border bg-background px-6 font-normal text-xs transition-colors hover:bg-accent/5"
                  >
                    <CreditCard className="mr-2 h-3.5 w-3.5" />
                    {portalMutation.isPending
                      ? dictionary.common.opening || "Opening..."
                      : billingDict.manage_subscription}
                  </Button>
                  <Button asChild className="h-9 rounded-none px-6 font-medium text-xs shadow-sm">
                    <Link href={getLocalizedUrl("/upgrade")}>{billingDict.upgrade || "Upgrade Plan"}</Link>
                  </Button>
                </>
              ) : (
                <Button asChild className="h-9 rounded-none px-8 font-medium text-xs shadow-sm">
                  <Link href={getLocalizedUrl("/upgrade")}>{billingDict.upgrade || "View Plans"}</Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Indicators */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Vault */}
        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center justify-between font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
              {billingDict.vault_storage || "Vault Storage"}
              <Shield className="h-3.5 w-3.5 text-muted-foreground/50" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0">
            <div className="flex items-baseline justify-between">
              <div className="font-medium font-serif text-2xl tracking-tight">
                {formatBytes(vaultUsed)}
                <span className="ml-1.5 font-normal text-muted-foreground text-xs uppercase">
                  / {formatBytes(vaultLimitBytes)}
                </span>
              </div>
              <span className="font-medium text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                {vaultProgress.toFixed(0)}%
              </span>
            </div>
            <div className="space-y-2">
              <Progress value={vaultProgress} className="h-1 rounded-none bg-muted/40" />
              <div className="flex justify-between font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                <span>{dictionary.common.used || "Used"}</span>
                <span>
                  {formatBytes(Math.max(0, vaultLimitBytes - vaultUsed))} {dictionary.common.remaining || "Remaining"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Tokens */}
        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="flex items-center justify-between font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
              {billingDict.ai_tokens || "AI Tokens"}
              <Zap className="h-3.5 w-3.5 text-muted-foreground/50" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-0">
            <div className="flex items-baseline justify-between">
              <div className="font-medium font-serif text-2xl tracking-tight">
                {aiUsed.toLocaleString()}
                <span className="ml-1.5 font-normal text-muted-foreground text-xs uppercase">
                  / {aiLimitTokens.toLocaleString()}
                </span>
              </div>
              <span className="font-medium text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                {aiProgress.toFixed(0)}%
              </span>
            </div>
            <div className="space-y-2">
              <Progress value={aiProgress} className="h-1 rounded-none bg-muted/40" />
              <div className="flex justify-between font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                <span>{dictionary.common.used || "Used"}</span>
                <span>
                  {Math.max(0, aiLimitTokens - aiUsed).toLocaleString()} {dictionary.common.remaining || "Remaining"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add-ons List (Horizontal Rows) */}
      <div className="space-y-4">
        <div className="border-b pb-2">
          <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
            {billingDict.addons || "Monthly Add-ons"}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {initialAddons.map((addon) => {
            const price = displayPrice(addon, "monthly", {
              currency,
              compact: true,
            });
            const priceId = getGatewayPrice(addon, "addon", currency);
            const activeAddons = workspace?.active_addons ?? [];
            const addonData = activeAddons.find((a) => a.id === addon.id);
            const isActive = addonData !== undefined;

            return (
              <Card
                key={addon.id}
                className={cn(
                  "rounded-none border bg-background p-4 shadow-none transition-all hover:bg-accent/5",
                  isActive && "opacity-80",
                )}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center border",
                        addon.addon_type === "ai"
                          ? "border-amber-500/20 bg-amber-500/5 text-amber-500"
                          : "border-emerald-500/20 bg-emerald-500/5 text-emerald-500",
                      )}
                    >
                      {addon.addon_type === "ai" ? <Zap className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm tracking-tight">{addon.name}</span>
                        {isActive && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "h-3.5 rounded-none px-1 font-mono text-[8px] uppercase",
                              addon.addon_type === "ai"
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-emerald-500/10 text-emerald-600",
                            )}
                          >
                            {dictionary.common.active || "Active"}
                          </Badge>
                        )}
                      </div>
                      <p className="line-clamp-1 max-w-md text-[10px] text-muted-foreground">{addon.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-6 sm:justify-end sm:gap-10">
                    <div className="whitespace-nowrap text-right">
                      <p className="mb-0.5 font-medium text-[9px] text-muted-foreground uppercase tracking-widest">
                        {addon.addon_type === "ai" ? "Quota" : "Storage"}
                      </p>
                      <p className="font-medium font-serif text-xs">
                        {addon.addon_type === "ai"
                          ? `+${addon.max_ai_tokens.toLocaleString()}`
                          : `+${addon.max_vault_size_mb} MB`}
                      </p>
                    </div>

                    {addonData?.status === "cancelled" && (
                        <div className="whitespace-nowrap text-right">
                          <p className="mb-0.5 font-medium text-[9px] text-destructive uppercase tracking-widest">
                            {billingDict.deactivating_at || "Deactivating at"}
                          </p>
                          <p className="font-medium text-destructive text-xs">
                            {(() => {
                              if (!addonData?.created_at) return null;
                              const date = new Date(addonData.created_at);
                              date.setMonth(date.getMonth() + 1);
                              return date.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              });
                            })()}
                          </p>
                        </div>
                      )}

                    <div className="min-w-[80px] whitespace-nowrap text-right">
                      <p className="mb-0.5 font-medium text-[9px] text-muted-foreground uppercase tracking-widest">
                        {billingDict.price || "Price"}
                      </p>
                      <p className="font-medium font-serif text-xs">
                        {price?.label}{" "}
                        <span className="font-normal text-[9px] text-muted-foreground">/ {billingDict.mo}</span>
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant={isActive ? "outline" : "default"}
                      className="h-8 rounded-none px-5 text-[10px] uppercase tracking-widest"
                      disabled={checkoutMutation.isPending || cancelAddonMutation.isPending}
                      onClick={async () => {
                        if (isActive) {
                          if (addonData?.status === "active") {
                            const ok = await confirm({
                              title: dictionary.settings.billing.deactivate_addon_title || "Deactivate Add-on",
                              description:
                                dictionary.settings.billing.deactivate_addon_desc ||
                                "Are you sure you want to deactivate this add-on? It will remain active until the end of your current billing cycle.",
                              confirmLabel: billingDict.deactivate || "Deactivate",
                              destructive: true,
                            });

                            if (ok) {
                              cancelAddonMutation.mutate(addon.id);
                            }
                          }
                        } else if (priceId) {
                          checkoutMutation.mutate({
                            priceId,
                            type: "payment",
                            addonId: addon.id,
                            addonType: addon.addon_type as "ai" | "vault",
                            amount: addon.prices.find((p) => p.currency === currency)?.monthly || 0,
                          });
                        }
                      }}
                    >
                      {isActive
                        ? addonData?.status === "cancelled"
                          ? dictionary.common.cancelled || "Cancelled"
                          : cancelAddonMutation.isPending && cancelAddonMutation.variables === addon.id
                            ? "..."
                            : billingDict.deactivate || "Deactivate"
                        : checkoutMutation.isPending
                          ? dictionary.common.processing || "Processing..."
                          : billingDict.purchase || billingDict.get_started || "Purchase"}
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
          <p className="font-semibold text-[10px] text-muted-foreground uppercase tracking-widest">
            {billingDict.history.title}
          </p>
        </div>
        <Card className="overflow-hidden rounded-none border bg-background shadow-none">
          <CardContent className="p-0">
            {loadingHistory ? (
              <div className="space-y-4 p-6">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-none" />
                ))}
              </div>
            ) : history.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b bg-accent/5 font-semibold text-muted-foreground/80 uppercase tracking-widest">
                      <th className="p-4 font-semibold text-[10px]">{billingDict.history.date}</th>
                      <th className="p-4 font-semibold text-[10px]">{billingDict.history.invoice}</th>
                      <th className="p-4 font-semibold text-[10px]">{billingDict.history.amount}</th>
                      <th className="p-4 font-semibold text-[10px]">{billingDict.history.status}</th>
                      <th className="p-4 text-right font-semibold text-[10px]">{billingDict.history.action}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted/40">
                    {history.map((order) => (
                      <tr key={order.id} className="group transition-all hover:bg-accent/5">
                        <td className="p-4 font-medium text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>
                        <td className="p-4 font-medium tracking-tight">{order.code}</td>
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
                              "rounded-none border px-2 py-0.5 font-semibold text-[9px] uppercase",
                              order.status.toLowerCase() === "paid"
                                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500"
                                : "text-muted-foreground",
                            )}
                          >
                            {order.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          {order.mayar_invoice_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 rounded-none border px-3 font-medium text-[10px] uppercase tracking-widest transition-all hover:bg-foreground hover:text-background"
                              onClick={() => {
                                if (!order.mayar_invoice_id) return;
                                downloadMutation.mutate(order.mayar_invoice_id);
                              }}
                              disabled={downloadMutation.isPending}
                            >
                              {downloadMutation.isPending && downloadMutation.variables === order.mayar_invoice_id
                                ? "..."
                                : dictionary.common.view_pdf || "View PDF"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-accent/5 p-16 text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-none border-dashed opacity-50">
                  <CreditCard className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="mb-1 font-semibold text-xs uppercase tracking-widest">{billingDict.history.no_history}</p>
                <p className="mx-auto max-w-[200px] text-[11px] text-muted-foreground leading-relaxed">
                  {billingDict.history.no_history_description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
