"use client";

import { useEffect, useState } from "react";

import { useParams, useRouter } from "next/navigation";

import { COUNTRIES } from "@workspace/constants";
import { onboardingCreateWorkspaceAction } from "@workspace/modules/auth/auth.action";
import { createCheckoutSession } from "@workspace/modules/mayar/mayar.action";
import { createBrowserClient } from "@workspace/supabase/client";
import type { Pricing } from "@workspace/types";
import { Badge, Button, cn } from "@workspace/ui";
import { annualSavingsPct, displayPrice, getGatewayPrice, isFree } from "@workspace/utils";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { BusinessDetailsForm } from "./business-details-form";

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "h-1.5 rounded-full transition-all",
          step === 1 ? "w-6 bg-foreground" : "w-3 bg-muted-foreground/30",
        )}
      />
      <span
        className={cn(
          "h-1.5 rounded-full transition-all",
          step === 2 ? "w-6 bg-foreground" : "w-3 bg-muted-foreground/30",
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkspaceFormProps {
  plans: Pricing[];
}

export function WorkspaceForm({ plans }: WorkspaceFormProps) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 fields
  const [name, setName] = useState("");
  const [country, setCountry] = useState("Indonesia");
  const [currency, setCurrency] = useState({ code: "IDR", symbol: "Rp" });

  // Step 2 fields
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [billingCurrency, setBillingCurrency] = useState<"usd" | "eur" | "idr">("idr");
  const defaultPlanId = (plans.find(isFree) ?? plans[0])?.id ?? null;
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(defaultPlanId);

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Creating workspace…");
  const [error, setError] = useState<string | null>(null);

  const params = useParams();
  const locale = params.locale as string;

  // Handle country change to auto-update currency
  const handleCountryChange = (countryName: string) => {
    setCountry(countryName);
    const countryData = (COUNTRIES as Array<{ name: string; currency?: { code: string; symbol: string } }>).find(
      (c) => c.name === countryName,
    );
    if (countryData?.currency) {
      setCurrency({
        code: countryData.currency.code,
        symbol: countryData.currency.symbol,
      });

      // Also update billing currency if it's one of the supported ones
      const code = countryData.currency.code.toLowerCase();
      if (["usd", "eur", "idr"].includes(code)) {
        setBillingCurrency(code as "usd" | "eur" | "idr");
      }
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) router.push(`/${locale}/login`);
    };
    checkAuth();
  }, [locale, router]);

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    // Step 1: Create the workspace (orchestrated action sets cookie)
    setLoadingMsg("Creating workspace…");
    const createResult = await onboardingCreateWorkspaceAction({
      name: name.trim(),
      country,
      mainCurrencyCode: currency.code,
      mainCurrencySymbol: currency.symbol,
    });

    if (!createResult.success) {
      setError(createResult.error);
      setLoading(false);
      return;
    }

    if (!createResult.data?.id) {
      setError("Workspace created but session payload is incomplete. Please try again.");
      setLoading(false);
      return;
    }

    // Step 2: If free plan, done — redirect to overview
    const selectedPlan = plans.find((p) => p.id === selectedPlanId);
    if (!selectedPlan || isFree(selectedPlan)) {
      setLoadingMsg("Redirecting…");
      router.push(`/${locale}/overview`);
      return;
    }

    // Step 3: Paid plan — get the Mayar price ID and open checkout
    const gatewayPrice = getGatewayPrice(selectedPlan, billing, billingCurrency);

    if (!gatewayPrice) {
      // Plan chosen but no Mayar price ID configured yet — skip checkout gracefully
      setLoadingMsg("Redirecting…");
      router.push(`/${locale}/overview`);
      return;
    }

    setLoadingMsg("Redirecting to checkout…");
    const checkoutResult = await createCheckoutSession(
      gatewayPrice,
      createResult.data.id,
      `/${locale}/overview`,
      "subscription",
      undefined,
      undefined,
      undefined,
      billing,
      locale,
    );

    if (!checkoutResult.success || !checkoutResult.data.url) {
      setError(checkoutResult.error ?? "Failed to start checkout. You can upgrade later from Settings.");
      setLoading(false);
      return;
    }

    // Redirect to Mayar-hosted checkout
    window.location.href = checkoutResult.data.url;
  };

  const selected = plans.find((p) => p.id === selectedPlanId);
  const hasAnnual = plans.some((p) => p.prices.some((pr) => pr.yearly > 0) && !isFree(p));
  const hasPaid = plans.some((p) => !isFree(p));
  const _bestSavings = Math.max(...plans.map((p) => annualSavingsPct(p) ?? 0));

  return (
    <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[450px]">
      {/* ------------------------------------------------------------------ */}
      {/* STEP 1 — Business details                                           */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <>
          <div className="space-y-3">
            <Steps step={1} />
            <h1 className="font-sans text-2xl tracking-tight">Business details</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Add company details so amounts, currency, tax, and reporting periods line up correctly across insights,
              invoices and exports.
            </p>
          </div>

          <BusinessDetailsForm
            name={name}
            setName={setName}
            country={country}
            onCountryChange={handleCountryChange}
            currencyCode={currency.code}
            onCurrencySelect={(c: { code: string; symbol: string }) => setCurrency({ code: c.code, symbol: c.symbol })}
            onSubmit={handleContinue}
            submitLabel="Continue"
          />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP 2 — Plan selection                                             */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Steps step={2} />
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-3" />
                Back
              </button>
            </div>
            <h1 className="font-sans text-2xl tracking-tight">Choose a plan</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {hasPaid
                ? "Start with a 14-day free trial on paid plans. No credit card required."
                : "Select the plan that works best for your team."}
            </p>
          </div>

          <div className="space-y-5">
            {/* Billing toggles */}
            <div className="grid grid-cols-2 gap-3">
              {hasAnnual && (
                <div className="flex items-center gap-1 border border-border/60 p-1">
                  <button
                    type="button"
                    onClick={() => setBilling("monthly")}
                    className={cn(
                      "flex-1 py-1.5 font-medium text-xs transition-all",
                      billing === "monthly"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBilling("annual")}
                    className={cn(
                      "flex-1 py-1.5 font-medium text-xs transition-all",
                      billing === "annual"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Annual
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1 border border-border/60 p-1">
                {(["usd", "eur", "idr"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBillingCurrency(c)}
                    className={cn(
                      "flex-1 py-1.5 font-bold text-[10px] uppercase transition-all",
                      billingCurrency === c
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Plan cards */}
            <div className="space-y-2">
              {plans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const free = isFree(plan);
                const price = displayPrice(plan, billing, {
                  currency: billingCurrency,
                  currencySymbol: billingCurrency === "usd" ? "$" : billingCurrency === "eur" ? "€" : "Rp",
                });
                const savings = annualSavingsPct(plan, billingCurrency);
                const hasPriceId = !!getGatewayPrice(plan, billing, billingCurrency);

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={cn(
                      "w-full border px-4 py-3 text-left transition-all",
                      isSelected
                        ? "border-foreground bg-foreground/5"
                        : "border-border/60 hover:border-border hover:bg-muted/20",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">{plan.name}</span>
                          {free && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              Free forever
                            </Badge>
                          )}
                          {!free && billing === "annual" && savings && (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-500"
                            >
                              Save {savings}%
                            </Badge>
                          )}
                          {!free && !hasPriceId && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                              Coming soon
                            </Badge>
                          )}
                        </div>
                        {plan.description && <p className="mt-0.5 text-muted-foreground text-xs">{plan.description}</p>}
                        {isSelected && plan.features.length > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {plan.features.map((f) => (
                              <li key={f} className="flex items-center gap-2 text-muted-foreground text-xs">
                                <Check className="size-3 shrink-0 text-foreground" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <span className="font-semibold text-sm">{price?.label}</span>
                          {price.note && (
                            <span className="block whitespace-nowrap text-[10px] text-muted-foreground">
                              {price.note}
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                            isSelected ? "border-foreground bg-foreground text-background" : "border-border/60",
                          )}
                        >
                          {isSelected && <Check className="size-2.5 stroke-3" />}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                {error}
              </div>
            )}

            <Button type="button" className="w-full" onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  {loadingMsg}
                </span>
              ) : selected && !isFree(selected) ? (
                `Start free trial · ${selected.name} (${billing})`
              ) : (
                `Create workspace${selected ? ` · ${selected.name}` : ""}`
              )}
            </Button>

            {selected && !isFree(selected) && (
              <p className="text-center text-muted-foreground text-xs">
                14-day free trial, then{" "}
                {
                  displayPrice(selected, billing, {
                    currency: billingCurrency,
                    currencySymbol: billingCurrency === "usd" ? "$" : billingCurrency === "eur" ? "€" : "Rp",
                  }).label
                }{" "}
                {
                  displayPrice(selected, billing, {
                    currency: billingCurrency,
                    currencySymbol: billingCurrency === "usd" ? "$" : billingCurrency === "eur" ? "€" : "Rp",
                  }).note
                }
                . Cancel anytime.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
