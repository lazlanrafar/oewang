// Fetches subscription plans from the API's PUBLIC pricing endpoint
// (no auth, cached 1h server-side). Server-only.
import { decrypt } from "@workspace/encryption";

export type PublicPlanPrice = {
  currency: string;
  monthly: number;
  yearly: number;
};

export type PublicPlan = {
  id: string;
  name: string;
  description: string | null;
  prices: PublicPlanPrice[];
  features: string[];
  is_addon: boolean;
  addon_type: "ai" | "vault" | null;
  is_highlighted: boolean;
  comingSoon: boolean;
};

/**
 * Base (non-add-on) subscription plans, in display order. Returns [] on any
 * failure so the page degrades gracefully instead of throwing.
 */
export async function getPublicPlans(): Promise<PublicPlan[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
  try {
    // Public endpoint is mounted outside the /v1 group and returns plaintext.
    const res = await fetch(`${apiUrl}/public/pricing`, {
      // Mirror the API's 1h cache; ISR keeps the marketing page fast.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: unknown };

    // The API fleet is inconsistent: some instances return plaintext
    // ({ data: [...] }), others AES-encrypt the transport ({ data: "iv:ct" }).
    // Handle both — decrypt with the shared server-side key when needed.
    let payload: { data?: PublicPlan[] };
    if (typeof body.data === "string") {
      const key = process.env.ENCRYPTION_KEY;
      if (!key) return [];
      payload = JSON.parse(decrypt(body.data, key));
    } else {
      payload = body as { data?: PublicPlan[] };
    }

    const plans = Array.isArray(payload.data) ? payload.data : [];
    // Base tiers only, cheapest → most expensive (the API returns creation
    // order, which isn't a sensible pricing ladder).
    return plans
      .filter((p) => !p.is_addon)
      .sort((a, b) => monthlyOf(a) - monthlyOf(b));
  } catch {
    return [];
  }
}

function monthlyOf(plan: PublicPlan, currency = "usd"): number {
  const price = plan.prices.find((p) => p.currency === currency) ?? plan.prices[0];
  return price?.monthly ?? 0;
}

const ZERO_DECIMAL = new Set(["idr", "jpy", "krw", "vnd"]);

/**
 * Format a plan's monthly price for display. USD/EUR are stored in minor units
 * (cents); IDR and friends are whole. Defaults to USD for the English site.
 */
export function formatMonthly(
  plan: PublicPlan,
  currency = "usd",
): { amount: string; period: string; isFree: boolean } {
  const price =
    plan.prices.find((p) => p.currency === currency) ?? plan.prices[0];
  const raw = price?.monthly ?? 0;
  if (raw === 0) return { amount: "$0", period: "/mo", isFree: true };

  const code = (price?.currency ?? currency).toLowerCase();
  const value = ZERO_DECIMAL.has(code) ? raw : raw / 100;
  const symbol = code === "eur" ? "€" : code === "idr" ? "Rp" : "$";
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return { amount: `${symbol}${shown}`, period: "/mo", isFree: false };
}
