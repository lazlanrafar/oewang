import type { Pricing } from "@workspace/types";
import { formatCurrency } from "./currency";

export function isFree(plan: Pricing) {
  return !plan.prices || plan.prices.every(p => p.monthly === 0 && p.yearly === 0);
}

export function annualSavingsPct(plan: Pricing, currency: string = "usd"): number | null {
  const price = plan.prices?.find(p => p.currency === currency);
  if (!price || !price.monthly || !price.yearly) return null;
  return Math.round(
    ((price.monthly * 12 - price.yearly) /
      (price.monthly * 12)) *
      100,
  );
}

export function getStripePrice(
  plan: Pricing,
  billing: "monthly" | "annual",
  currency: string = "usd"
): string | null {
  if (isFree(plan)) return null;
  const price = plan.prices?.find(p => p.currency === currency);
  if (!price) return null;
  if (billing === "annual" && price.stripe_yearly_id) return price.stripe_yearly_id;
  if (billing === "monthly" && price.stripe_monthly_id) return price.stripe_monthly_id;
  return null;
}

export function displayPrice(
  plan: Pricing,
  billing: "monthly" | "annual",
  opts?: {
    showCents?: boolean;
    currencySymbol?: string;
    currency?: string;
  },
): {
  label: string;
  note?: string;
} {
  const { showCents = false, currencySymbol = "$", currency = "usd" } = opts ?? {};

  if (isFree(plan)) return { label: "Free" };

  const price = plan.prices?.find(p => p.currency === currency);
  if (!price) return { label: "N/A" };

  if (billing === "annual" && price.yearly != null && price.yearly > 0) {
    const perMonth = Math.round(price.yearly / 12);
    return {
      label: formatCurrency(perMonth / 100, {
        mainCurrencySymbol: currencySymbol,
        mainCurrencyDecimalPlaces: showCents ? 2 : 0,
      }),
      note: "/ mo, billed annually",
    };
  }
  if (price.monthly != null && price.monthly > 0) {
    return {
      label: formatCurrency(price.monthly / 100, {
        mainCurrencySymbol: currencySymbol,
        mainCurrencyDecimalPlaces: showCents ? 2 : 0,
      }),
      note: "/ month",
    };
  }

  return { label: "Free" };
}

export function getPlanLimits(plan: Pricing) {
  return {
    vaultLimitBytes: (plan.max_vault_size_mb || 0) * 1024 * 1024,
    aiLimitTokens: plan.max_ai_tokens || 0,
  };
}
