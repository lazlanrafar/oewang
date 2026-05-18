import { describe, test, expect } from "bun:test";
import {
  sanitizeAmount,
  calculateBalanceChange,
  isBudgetExceeded,
  calculateBudgetUsage,
  getBudgetStatus,
  formatTransactionAmount,
  validateTransactionAmount,
  getCurrentMonthRange,
} from "./transactions.utils";

describe("transactions.utils", () => {
  describe("sanitizeAmount", () => {
    test("converts number to string", () => {
      expect(sanitizeAmount(100)).toBe("100");
      expect(sanitizeAmount(1234.56)).toBe("1234.56");
    });

    test("returns string as-is", () => {
      expect(sanitizeAmount("100")).toBe("100");
      expect(sanitizeAmount("1234.56")).toBe("1234.56");
    });

    test("handles zero", () => {
      expect(sanitizeAmount(0)).toBe("0");
    });

    test("handles negative numbers", () => {
      expect(sanitizeAmount(-100)).toBe("-100");
    });
  });

  describe("calculateBalanceChange", () => {
    test("expense deducts from wallet", () => {
      expect(calculateBalanceChange("expense", 100, "from")).toBe(-100);
    });

    test("income adds to wallet", () => {
      expect(calculateBalanceChange("income", 100, "from")).toBe(100);
    });

    test("transfer deducts from source wallet", () => {
      expect(calculateBalanceChange("transfer", 100, "from")).toBe(-100);
    });

    test("transfer adds to destination wallet", () => {
      expect(calculateBalanceChange("transfer", 100, "to")).toBe(100);
    });

    test("handles decimal amounts", () => {
      expect(calculateBalanceChange("expense", 123.45, "from")).toBe(-123.45);
      expect(calculateBalanceChange("income", 123.45, "from")).toBe(123.45);
    });
  });

  describe("isBudgetExceeded", () => {
    test("returns true when spent equals budget", () => {
      expect(isBudgetExceeded(1000, 1000)).toBe(true);
    });

    test("returns true when spent exceeds budget", () => {
      expect(isBudgetExceeded(1500, 1000)).toBe(true);
    });

    test("returns false when spent is below budget", () => {
      expect(isBudgetExceeded(500, 1000)).toBe(false);
    });

    test("returns false when nothing spent", () => {
      expect(isBudgetExceeded(0, 1000)).toBe(false);
    });
  });

  describe("calculateBudgetUsage", () => {
    test("calculates percentage correctly", () => {
      expect(calculateBudgetUsage(500, 1000)).toBe(50);
      expect(calculateBudgetUsage(250, 1000)).toBe(25);
      expect(calculateBudgetUsage(750, 1000)).toBe(75);
    });

    test("rounds to nearest integer", () => {
      expect(calculateBudgetUsage(333, 1000)).toBe(33);
      expect(calculateBudgetUsage(666, 1000)).toBe(67);
    });

    test("handles 100% usage", () => {
      expect(calculateBudgetUsage(1000, 1000)).toBe(100);
    });

    test("handles over 100% usage", () => {
      expect(calculateBudgetUsage(1500, 1000)).toBe(150);
    });

    test("returns 0 when budget is 0", () => {
      expect(calculateBudgetUsage(100, 0)).toBe(0);
    });

    test("returns 0 when nothing spent", () => {
      expect(calculateBudgetUsage(0, 1000)).toBe(0);
    });
  });

  describe("getBudgetStatus", () => {
    test('returns "safe" when usage is below 80%', () => {
      expect(getBudgetStatus(500, 1000)).toBe("safe");
      expect(getBudgetStatus(790, 1000)).toBe("safe");
    });

    test('returns "warning" when usage is 80-99%', () => {
      expect(getBudgetStatus(800, 1000)).toBe("warning");
      expect(getBudgetStatus(900, 1000)).toBe("warning");
      expect(getBudgetStatus(990, 1000)).toBe("warning");
    });

    test('returns "exceeded" when usage is 100% or more', () => {
      expect(getBudgetStatus(1000, 1000)).toBe("exceeded");
      expect(getBudgetStatus(1100, 1000)).toBe("exceeded");
      expect(getBudgetStatus(1500, 1000)).toBe("exceeded");
    });

    test("handles edge cases", () => {
      expect(getBudgetStatus(0, 1000)).toBe("safe");
      expect(getBudgetStatus(790, 1000)).toBe("safe"); // 79%
      expect(getBudgetStatus(800, 1000)).toBe("warning"); // 80%
    });
  });

  describe("formatTransactionAmount", () => {
    test("formats expense with minus sign", () => {
      expect(formatTransactionAmount(1000, "expense")).toBe("-1.000");
      expect(formatTransactionAmount("1000", "expense")).toBe("-1.000");
    });

    test("formats income with plus sign", () => {
      expect(formatTransactionAmount(1000, "income")).toBe("+1.000");
      expect(formatTransactionAmount("1000", "income")).toBe("+1.000");
    });

    test("formats transfer without sign", () => {
      expect(formatTransactionAmount(1000, "transfer")).toBe("1.000");
      expect(formatTransactionAmount("1000", "transfer")).toBe("1.000");
    });

    test("uses Indonesian locale formatting", () => {
      expect(formatTransactionAmount(1234567, "income")).toBe("+1.234.567");
      expect(formatTransactionAmount(1000000, "expense")).toBe("-1.000.000");
    });

    test("handles decimal amounts", () => {
      expect(formatTransactionAmount(1234.56, "income")).toBe("+1.234,56");
      expect(formatTransactionAmount(999.99, "expense")).toBe("-999,99");
    });

    test("handles zero", () => {
      expect(formatTransactionAmount(0, "income")).toBe("+0");
      expect(formatTransactionAmount(0, "expense")).toBe("-0");
    });
  });

  describe("validateTransactionAmount", () => {
    test("validates positive numbers", () => {
      expect(validateTransactionAmount(100).valid).toBe(true);
      expect(validateTransactionAmount("100").valid).toBe(true);
      expect(validateTransactionAmount(0.01).valid).toBe(true);
    });

    test("rejects zero", () => {
      const result = validateTransactionAmount(0);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });

    test("rejects negative numbers", () => {
      const result = validateTransactionAmount(-100);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });

    test("rejects non-numeric values", () => {
      const result = validateTransactionAmount("abc");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("valid number");
    });

    test("rejects too large amounts", () => {
      const result = validateTransactionAmount(9999999999999);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too large");
    });

    test("accepts maximum valid amount", () => {
      expect(validateTransactionAmount(999999999999).valid).toBe(true);
    });

    test("handles string numbers", () => {
      expect(validateTransactionAmount("1234.56").valid).toBe(true);
      expect(validateTransactionAmount("0").valid).toBe(false);
    });
  });

  describe("getCurrentMonthRange", () => {
    test("returns start and end dates as ISO strings", () => {
      const { startDate, endDate } = getCurrentMonthRange();

      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("start date is first day of month at midnight", () => {
      const { startDate } = getCurrentMonthRange();
      const date = new Date(startDate);

      expect(date.getDate()).toBe(1);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });

    test("end date is last day of month at 23:59:59", () => {
      const { endDate } = getCurrentMonthRange();
      const date = new Date(endDate);
      const now = new Date();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      expect(date.getDate()).toBe(lastDay);
      expect(date.getHours()).toBe(23);
      expect(date.getMinutes()).toBe(59);
      expect(date.getSeconds()).toBe(59);
    });

    test("start date is before end date", () => {
      const { startDate, endDate } = getCurrentMonthRange();
      expect(new Date(startDate) < new Date(endDate)).toBe(true);
    });

    test("dates are in current month", () => {
      const { startDate, endDate } = getCurrentMonthRange();
      const now = new Date();
      const start = new Date(startDate);
      const end = new Date(endDate);

      expect(start.getMonth()).toBe(now.getMonth());
      expect(end.getMonth()).toBe(now.getMonth());
      expect(start.getFullYear()).toBe(now.getFullYear());
      expect(end.getFullYear()).toBe(now.getFullYear());
    });
  });
});
