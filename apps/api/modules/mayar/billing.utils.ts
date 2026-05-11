import type { Pricing } from "@workspace/types";

export type BillingInterval = "monthly" | "annual";

function normalizeBilling(
  billing?: string | null,
): BillingInterval | null {
  if (billing === "annual" || billing === "yearly") return "annual";
  if (billing === "monthly") return "monthly";
  return null;
}

export function calculatePeriodEnd(
  startAt: Date,
  billingInterval: BillingInterval,
): Date {
  const periodEnd = new Date(startAt);
  const originalDay = periodEnd.getDate();

  if (billingInterval === "annual") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    const originalMonth = periodEnd.getMonth();
    periodEnd.setDate(1);
    periodEnd.setMonth(originalMonth + 1);
    const lastDayOfTargetMonth = new Date(
      periodEnd.getFullYear(),
      periodEnd.getMonth() + 1,
      0,
    ).getDate();
    periodEnd.setDate(Math.min(originalDay, lastDayOfTargetMonth));
  }

  return periodEnd;
}

export function inferBillingInterval(params: {
  billing?: string | null;
  planId?: string | null;
  matchedPlan?: Pricing | null;
  amount?: number | null;
}): BillingInterval {
  const explicitBilling = normalizeBilling(params.billing);
  if (explicitBilling) return explicitBilling;

  const planId = params.planId || null;
  const amount = Number(params.amount || 0);

  for (const price of params.matchedPlan?.prices || []) {
    if (planId && price.mayar_yearly_id === planId) return "annual";
    if (planId && price.mayar_monthly_id === planId) return "monthly";
    if (amount && price.yearly === amount && price.monthly !== amount) {
      return "annual";
    }
    if (amount && price.monthly === amount) {
      return "monthly";
    }
  }

  return "monthly";
}
