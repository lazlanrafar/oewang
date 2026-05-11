import { describe, expect, it } from "bun:test";
import { calculatePeriodEnd, inferBillingInterval } from "./billing.utils";

describe("billing.utils", () => {
  const matchedPlan = {
    prices: [
      {
        currency: "idr",
        monthly: 149000,
        yearly: 1490000,
        mayar_monthly_id: "PRO_MONTHLY_IDR",
        mayar_yearly_id: "PRO_YEARLY_IDR",
      },
    ],
  } as any;

  it("prefers explicit annual billing", () => {
    expect(inferBillingInterval({ billing: "annual", matchedPlan })).toBe("annual");
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
        amount: 1490000,
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
