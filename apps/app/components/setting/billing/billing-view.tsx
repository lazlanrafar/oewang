"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Skeleton,
  Progress,
} from "@workspace/ui";
import { Check, Zap, Shield, Rocket, CreditCard } from "lucide-react";
import {
  getPricing,
  createCheckoutSession,
  createCustomerPortal,
} from "@workspace/modules";
import { toast } from "sonner";
import { formatBytes } from "@workspace/utils";

interface BillingViewProps {
  dictionary: any;
  workspace: any;
}

export function BillingView({ dictionary, workspace }: BillingViewProps) {
  const { data: pricingData, isLoading: isLoadingPricing } = useQuery({
    queryKey: ["pricing"],
    queryFn: async () => {
      const result = await getPricing({ is_active: "true" });
      if (result.success) return result.data.pricingList;
      throw new Error(result.error);
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const result = await createCheckoutSession(priceId);
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

  const portalMutation = useMutation({
    mutationFn: async () => {
      const result = await createCustomerPortal();
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

  if (isLoadingPricing) {
    return <Skeleton className="h-[400px] w-full" />;
  }

  const currentPlanId = workspace.plan_id;
  const vaultUsed = workspace.vault_size_used_bytes || 0;
  const aiUsed = workspace.ai_tokens_used || 0;

  // Find current plan details from pricing list
  const currentPlan = pricingData?.find((p) => p.id === currentPlanId) || {
    name: "Free Tier",
    max_vault_size_mb: 50,
    max_ai_tokens: 50,
  };

  const vaultLimitBytes = currentPlan.max_vault_size_mb * 1024 * 1024;
  const vaultProgress = Math.min(100, (vaultUsed / vaultLimitBytes) * 100);
  const aiProgress = Math.min(100, (aiUsed / currentPlan.max_ai_tokens) * 100);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">{dictionary.billing.title}</h3>
          <p className="text-sm text-muted-foreground">
            {dictionary.billing.description}
          </p>
        </div>
        {workspace.stripe_subscription_id && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {dictionary.billing.manage_subscription}
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">
              {dictionary.billing.vault_storage}
            </CardTitle>
            <CardDescription className="text-2xl font-bold text-foreground">
              {formatBytes(vaultUsed)} / {currentPlan.max_vault_size_mb} MB
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={vaultProgress} className="h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              {vaultProgress.toFixed(1)}% of your storage used
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase">
              {dictionary.billing.ai_tokens}
            </CardTitle>
            <CardDescription className="text-2xl font-bold text-foreground">
              {aiUsed.toLocaleString()} /{" "}
              {currentPlan.max_ai_tokens.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={aiProgress} className="h-2" />
            <p className="mt-2 text-xs text-muted-foreground">
              {aiProgress.toFixed(1)}% of your monthly tokens used
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {pricingData?.map((plan) => (
          <Card
            key={plan.id}
            className={
              currentPlanId === plan.id
                ? "border-primary shadow-md relative overflow-hidden"
                : ""
            }
          >
            {currentPlanId === plan.id && (
              <div className="absolute top-0 right-0 p-2 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                Current Plan
              </div>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold">
                  {plan.price_monthly !== null
                    ? `$${(plan.price_monthly / 100).toFixed(2)}`
                    : "Free"}
                </span>
                {plan.price_monthly !== null && (
                  <span className="text-muted-foreground ml-1">/mo</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <Check className="mr-2 h-4 w-4 text-green-500" />
                  {plan.max_vault_size_mb}MB Vault Storage
                </li>
                <li className="flex items-center">
                  <Check className="mr-2 h-4 w-4 text-green-500" />
                  {plan.max_ai_tokens.toLocaleString()} AI Tokens
                </li>
                {plan.features.map((feature: string, i: number) => (
                  <li key={i} className="flex items-center">
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={currentPlanId === plan.id ? "secondary" : "default"}
                disabled={
                  currentPlanId === plan.id || checkoutMutation.isPending
                }
                onClick={() => {
                  if (plan.stripe_price_id_monthly) {
                    checkoutMutation.mutate(plan.stripe_price_id_monthly);
                  } else {
                    toast.error(
                      "This plan does not have a price ID configured.",
                    );
                  }
                }}
              >
                {currentPlanId === plan.id
                  ? dictionary.billing.active_plan
                  : dictionary.billing.upgrade}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
