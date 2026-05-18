import { describe, test, expect } from "bun:test";
import {
  calculateDebtStatus,
  calculateRemainingAfterPayment,
  calculateRemainingAfterAmountChange,
  calculatePaymentProgress,
  isDebtOverdue,
  getDaysUntilDue,
  formatDebtLabel,
  validatePaymentAmount,
  calculateDebtSummary,
  splitBillAmount,
} from "./debts.utils";

describe("debts.utils", () => {
  describe("calculateDebtStatus", () => {
    test('returns "paid" when remaining is 0', () => {
      expect(calculateDebtStatus(0, 1000)).toBe("paid");
    });

    test('returns "paid" when remaining is negative', () => {
      expect(calculateDebtStatus(-10, 1000)).toBe("paid");
    });

    test('returns "partial" when some amount is paid', () => {
      expect(calculateDebtStatus(500, 1000)).toBe("partial");
      expect(calculateDebtStatus(100, 1000)).toBe("partial");
      expect(calculateDebtStatus(900, 1000)).toBe("partial");
    });

    test('returns "unpaid" when nothing is paid', () => {
      expect(calculateDebtStatus(1000, 1000)).toBe("unpaid");
    });

    test('returns "unpaid" when remaining exceeds total (edge case)', () => {
      expect(calculateDebtStatus(1500, 1000)).toBe("unpaid");
    });
  });

  describe("calculateRemainingAfterPayment", () => {
    test("deducts payment from remaining", () => {
      expect(calculateRemainingAfterPayment(1000, 300)).toBe(700);
      expect(calculateRemainingAfterPayment(500, 100)).toBe(400);
    });

    test("returns 0 when payment equals remaining", () => {
      expect(calculateRemainingAfterPayment(1000, 1000)).toBe(0);
    });

    test("returns 0 when payment exceeds remaining (not negative)", () => {
      expect(calculateRemainingAfterPayment(1000, 1500)).toBe(0);
    });

    test("handles decimal amounts", () => {
      expect(calculateRemainingAfterPayment(1000.50, 300.25)).toBe(700.25);
    });
  });

  describe("calculateRemainingAfterAmountChange", () => {
    test("increases remaining when amount increases", () => {
      expect(calculateRemainingAfterAmountChange(1000, 1500, 1000)).toBe(1500);
    });

    test("decreases remaining when amount decreases", () => {
      expect(calculateRemainingAfterAmountChange(1000, 800, 1000)).toBe(800);
    });

    test("handles partial payments correctly", () => {
      // Original: 1000 total, 600 remaining (400 paid)
      // New total: 1200
      // New remaining should be 800 (still 400 paid)
      expect(calculateRemainingAfterAmountChange(1000, 1200, 600)).toBe(800);
    });

    test("returns 0 if calculation would be negative", () => {
      expect(calculateRemainingAfterAmountChange(1000, 300, 500)).toBe(0);
    });

    test("handles no change in amount", () => {
      expect(calculateRemainingAfterAmountChange(1000, 1000, 600)).toBe(600);
    });
  });

  describe("calculatePaymentProgress", () => {
    test("returns 0% when nothing paid", () => {
      expect(calculatePaymentProgress(1000, 1000)).toBe(0);
    });

    test("returns 100% when fully paid", () => {
      expect(calculatePaymentProgress(1000, 0)).toBe(100);
    });

    test("calculates partial progress correctly", () => {
      expect(calculatePaymentProgress(1000, 500)).toBe(50);
      expect(calculatePaymentProgress(1000, 250)).toBe(75);
      expect(calculatePaymentProgress(1000, 750)).toBe(25);
    });

    test("rounds to nearest integer", () => {
      expect(calculatePaymentProgress(1000, 333)).toBe(67);
      expect(calculatePaymentProgress(1000, 666)).toBe(33);
    });

    test("returns 100% when total is 0", () => {
      expect(calculatePaymentProgress(0, 0)).toBe(100);
    });
  });

  describe("isDebtOverdue", () => {
    test("returns false when no due date", () => {
      expect(isDebtOverdue(null)).toBe(false);
      expect(isDebtOverdue(undefined)).toBe(false);
    });

    test("returns true for past dates", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isDebtOverdue(yesterday.toISOString())).toBe(true);
    });

    test("returns false for future dates", () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isDebtOverdue(tomorrow.toISOString())).toBe(false);
    });

    test("handles today as not overdue", () => {
      const today = new Date();
      // Debt due today should not be overdue yet
      expect(isDebtOverdue(today.toISOString())).toBe(false);
    });
  });

  describe("getDaysUntilDue", () => {
    test("returns null when no due date", () => {
      expect(getDaysUntilDue(null)).toBeNull();
      expect(getDaysUntilDue(undefined)).toBeNull();
    });

    test("returns positive days for future dates", () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const days = getDaysUntilDue(future.toISOString());
      expect(days).toBeGreaterThanOrEqual(4);
      expect(days).toBeLessThanOrEqual(5);
    });

    test("returns negative days for past dates", () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const days = getDaysUntilDue(past.toISOString());
      expect(days).toBeLessThanOrEqual(-4);
    });

    test("returns 0 or 1 for today", () => {
      const today = new Date();
      const days = getDaysUntilDue(today.toISOString());
      expect(days).toBeGreaterThanOrEqual(0);
      expect(days).toBeLessThanOrEqual(1);
    });
  });

  describe("formatDebtLabel", () => {
    test("formats payable debt", () => {
      expect(formatDebtLabel("payable", "John")).toBe("You owe John");
      expect(formatDebtLabel("payable", "Acme Corp")).toBe("You owe Acme Corp");
    });

    test("formats receivable debt", () => {
      expect(formatDebtLabel("receivable", "John")).toBe("John owes you");
      expect(formatDebtLabel("receivable", "Acme Corp")).toBe("Acme Corp owes you");
    });
  });

  describe("validatePaymentAmount", () => {
    test("validates correct payment amount", () => {
      expect(validatePaymentAmount(500, 1000).valid).toBe(true);
      expect(validatePaymentAmount(1000, 1000).valid).toBe(true);
    });

    test("rejects zero payment", () => {
      const result = validatePaymentAmount(0, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });

    test("rejects negative payment", () => {
      const result = validatePaymentAmount(-100, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("greater than 0");
    });

    test("rejects payment exceeding remaining", () => {
      const result = validatePaymentAmount(1500, 1000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot exceed remaining");
      expect(result.error).toContain("1000");
    });

    test("accepts full payment", () => {
      expect(validatePaymentAmount(1000, 1000).valid).toBe(true);
    });
  });

  describe("calculateDebtSummary", () => {
    test("calculates summary for mixed debts", () => {
      const debts = [
        { type: "payable" as const, amount: 1000, remainingAmount: 500, status: "partial" as const },
        { type: "receivable" as const, amount: 800, remainingAmount: 800, status: "unpaid" as const },
        { type: "payable" as const, amount: 500, remainingAmount: 0, status: "paid" as const },
      ];

      const summary = calculateDebtSummary(debts);
      expect(summary.totalPayable).toBe(500); // Only remaining payable
      expect(summary.totalReceivable).toBe(800); // Remaining receivable
      expect(summary.totalPaid).toBe(500); // Only the paid debt
      expect(summary.totalUnpaid).toBe(1300); // 500 + 800 remaining
    });

    test("handles all paid debts", () => {
      const debts = [
        { type: "payable" as const, amount: 1000, remainingAmount: 0, status: "paid" as const },
        { type: "receivable" as const, amount: 500, remainingAmount: 0, status: "paid" as const },
      ];

      const summary = calculateDebtSummary(debts);
      expect(summary.totalPayable).toBe(0);
      expect(summary.totalReceivable).toBe(0);
      expect(summary.totalPaid).toBe(1500);
      expect(summary.totalUnpaid).toBe(0);
    });

    test("handles empty debt list", () => {
      const summary = calculateDebtSummary([]);
      expect(summary.totalPayable).toBe(0);
      expect(summary.totalReceivable).toBe(0);
      expect(summary.totalPaid).toBe(0);
      expect(summary.totalUnpaid).toBe(0);
    });

    test("handles string amounts", () => {
      const debts = [
        { type: "payable" as const, amount: "1000", remainingAmount: "500", status: "partial" as const },
      ];

      const summary = calculateDebtSummary(debts);
      expect(summary.totalPayable).toBe(500);
      expect(summary.totalUnpaid).toBe(500);
    });
  });

  describe("splitBillAmount", () => {
    test("splits bill evenly", () => {
      expect(splitBillAmount(1000, 4)).toBe(250);
      expect(splitBillAmount(100, 5)).toBe(20);
    });

    test("rounds to 2 decimal places", () => {
      expect(splitBillAmount(100, 3)).toBe(33.33);
      expect(splitBillAmount(1000, 7)).toBe(142.86);
    });

    test("handles single person", () => {
      expect(splitBillAmount(1000, 1)).toBe(1000);
    });

    test("returns total when numberOfPeople is 0", () => {
      expect(splitBillAmount(1000, 0)).toBe(1000);
    });

    test("returns total when numberOfPeople is negative", () => {
      expect(splitBillAmount(1000, -1)).toBe(1000);
    });

    test("handles large groups", () => {
      expect(splitBillAmount(10000, 100)).toBe(100);
    });
  });
});
