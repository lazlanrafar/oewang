import { describe, expect, test } from "bun:test";
import { aggregateRecall, type RecallRow } from "./ai.recall.utils";

function row(overrides: Partial<RecallRow> = {}): RecallRow {
  return {
    name: "In Mild Cigarette",
    amount: "25000",
    type: "expense",
    date: "2026-06-10",
    walletId: "wallet_bca",
    walletName: "BCA",
    categoryId: "cat_cig",
    categoryName: "Cigarettes",
    ...overrides,
  };
}

describe("ai.recall.utils", () => {
  describe("aggregateRecall", () => {
    test("returns empty array when no rows match", () => {
      expect(aggregateRecall([])).toEqual([]);
    });

    test("groups transactions by normalized name and counts them", () => {
      const result = aggregateRecall([
        row({ date: "2026-06-10" }),
        row({ name: "in mild cigarette", date: "2026-05-01" }),
        row({ name: "  In Mild Cigarette ", date: "2026-04-01" }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.count).toBe(3);
      expect(result[0]!.name).toBe("In Mild Cigarette");
    });

    test("uses the most recent row for last price, wallet, and category", () => {
      const result = aggregateRecall([
        row({
          date: "2026-04-01",
          amount: "20000",
          walletName: "Cash",
          walletId: "wallet_cash",
        }),
        row({ date: "2026-06-10", amount: "27000", walletName: "BCA" }),
      ]);

      expect(result[0]!.lastAmount).toBe(27000);
      expect(result[0]!.lastDate).toBe("2026-06-10");
      expect(result[0]!.walletName).toBe("BCA");
    });

    test("computes avg, min, and max amounts", () => {
      const result = aggregateRecall([
        row({ amount: "20000", date: "2026-06-01" }),
        row({ amount: "30000", date: "2026-06-02" }),
        row({ amount: "25000", date: "2026-06-03" }),
      ]);

      expect(result[0]!.avgAmount).toBe(25000);
      expect(result[0]!.minAmount).toBe(20000);
      expect(result[0]!.maxAmount).toBe(30000);
    });

    test("skips transfers and rows with empty names or invalid amounts", () => {
      const result = aggregateRecall([
        row({ type: "transfer" }),
        row({ name: "" }),
        row({ name: null }),
        row({ amount: "0" }),
        row({ amount: "not-a-number" }),
        row({ name: "Coffee", amount: "15000" }),
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("Coffee");
    });

    test("orders suggestions by frequency then recency", () => {
      const result = aggregateRecall([
        row({ name: "Coffee", date: "2026-06-15", amount: "15000" }),
        row({ name: "In Mild Cigarette", date: "2026-06-10" }),
        row({ name: "In Mild Cigarette", date: "2026-05-10" }),
      ]);

      expect(result[0]!.name).toBe("In Mild Cigarette");
      expect(result[0]!.count).toBe(2);
      expect(result[1]!.name).toBe("Coffee");
    });

    test("caps the number of suggestions", () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        row({ name: `Item ${i}`, date: `2026-06-${10 + i}` }),
      );
      expect(aggregateRecall(rows, 3)).toHaveLength(3);
    });
  });
});
