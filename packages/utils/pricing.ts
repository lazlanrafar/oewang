import type { Pricing } from "@workspace/types";
import { formatCurrency, CURRENCY_CONFIG, formatPrice } from "./currency";

export function isFree(plan: Pricing) {
  return (
    !plan.prices || plan.prices.every((p) => p.monthly === 0 && p.yearly === 0)
  );
}

export function annualSavingsPct(
  plan: Pricing,
  currency: string = "usd",
): number | null {
  const price = plan.prices?.find((p) => p.currency === currency);
  if (!price || !price.monthly || !price.yearly) return null;
  return Math.round(
    ((price.monthly * 12 - price.yearly) / (price.monthly * 12)) * 100,
  );
}

export function getGatewayPrice(
  plan: Pricing,
  billing: "monthly" | "annual" | "addon",
  currency: string = "usd",
): string | null {
  if (isFree(plan) && billing !== "addon") return null;
  const price = plan.prices?.find((p) => p.currency === currency);
  if (!price) return null;
  
  if (billing === "annual" && price.xendit_yearly_id)
    return price.xendit_yearly_id;
  if (billing === "monthly" && price.xendit_monthly_id)
    return price.xendit_monthly_id;
  if (billing === "addon" && price.xendit_product_id)
    return price.xendit_product_id;

  return null;
}

export function displayPrice(
  plan: Pricing,
  billing: "monthly" | "annual",
  opts?: {
    showCents?: boolean;
    currencySymbol?: string;
    currency?: string;
    compact?: boolean;
  },
): {
  label: string;
  note?: string;
} {
  const { currency = "usd", compact = false } = opts ?? {};

  if (isFree(plan)) return { label: "Free" };

  const price = plan.prices?.find((p) => p.currency === currency);
  if (!price) return { label: "N/A" };

  if (billing === "annual" && price.yearly != null && price.yearly > 0) {
    const perMonth = Math.round(price.yearly / 12);
    return {
      label: formatPrice(perMonth, currency, { compact }),
      note: "/ mo, billed annually",
    };
  }

  if (price.monthly != null && price.monthly > 0) {
    return {
      label: formatPrice(price.monthly, currency, { compact }),
      note: "/ month",
    };
  }

  return { label: "Free" };
}

export function getPlanLimits(plan: Pricing, extras?: { extra_vault_size_mb?: number; extra_ai_tokens?: number }) {
  const vaultLimitMb = (plan.max_vault_size_mb || 0) + (extras?.extra_vault_size_mb || 0);
  const aiLimitTokens = (plan.max_ai_tokens || 0) + (extras?.extra_ai_tokens || 0);
  
  return {
    vaultLimitBytes: vaultLimitMb * 1024 * 1024,
    aiLimitTokens,
  };
}
