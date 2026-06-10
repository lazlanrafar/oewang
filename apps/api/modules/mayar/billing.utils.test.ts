import { describe, expect, it } from "bun:test";
import type { Pricing } from "@workspace/types";
import { calculatePeriodEnd, inferBillingInterval } from "./billing.utils";

describe("billing.utils", () => {
  const matchedPlan: Pricing = {
    id: "pro-plan",
    name: "Pro",
    description: "Pro test plan",
    prices: [
      {
        currency: "idr",
        monthly: 99900,
        yearly: 959000,
        mayar_monthly_id: "PRO_MONTHLY_IDR",
        mayar_yearly_id: "PRO_YEARLY_IDR",
      },
    ],
    mayar_product_id: null,
    max_vault_size_mb: 15360,
    max_ai_tokens: 400000,
    max_workspaces: 10,
    features: [],
    is_active: true,
    is_addon: false,
    addon_type: null,
    deleted_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  };

  it("prefers explicit annual billing", () => {
    expect(inferBillingInterval({ billing: "annual", matchedPlan })).toBe(
      "annual",
    );
  });

  it("infers annual billing from yearly Mayar price id", () => {
    expect(
      inferBillingInterval({
        planId: "PRO_YEARLY_IDR",
        matchedPlan,
      }),
    ).toBe("annual");
  });

  it("infers annual billing from amount when metadata is missing", () => {
    expect(
      inferBillingInterval({
        amount: 959000,
        matchedPlan,
      }),
    ).toBe("annual");
  });

  it("adds one calendar month for monthly plans", () => {
    const start = new Date("2026-01-31T00:00:00.000Z");
    expect(calculatePeriodEnd(start, "monthly").toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("adds one calendar year for annual plans", () => {
    const start = new Date("2026-05-06T12:00:00.000Z");
    expect(calculatePeriodEnd(start, "annual").toISOString()).toBe(
      "2027-05-06T12:00:00.000Z",
    );
  });
});
