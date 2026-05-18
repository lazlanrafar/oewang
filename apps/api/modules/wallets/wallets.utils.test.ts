import { describe, test, expect } from "bun:test";
import {
  calculateNewBalance,
  hasSufficientBalance,
  formatBalance,
  calculateTotalBalance,
  getWalletStatus,
  validateWalletName,
  calculateBalanceChangePercentage,
  groupWalletsByType,
} from "./wallets.utils";

describe("wallets.utils", () => {
  describe("calculateNewBalance", () => {
    test("adds positive change to balance", () => {
      expect(calculateNewBalance(1000, 500)).toBe(1500);
      expect(calculateNewBalance("1000", 500)).toBe(1500);
    });

    test("subtracts negative change from balance", () => {
      expect(calculateNewBalance(1000, -300)).toBe(700);
      expect(calculateNewBalance("1000", -300)).toBe(700);
    });

    test("handles zero change", () => {
      expect(calculateNewBalance(1000, 0)).toBe(1000);
    });

    test("handles decimal amounts", () => {
      expect(calculateNewBalance(1000.50, 99.99)).toBe(1100.49);
    });

    test("can result in negative balance", () => {
      expect(calculateNewBalance(100, -200)).toBe(-100);
    });
  });

  describe("hasSufficientBalance", () => {
    test("returns true when balance exceeds amount", () => {
      expect(hasSufficientBalance(1000, 500)).toBe(true);
      expect(hasSufficientBalance("1000", 500)).toBe(true);
    });

    test("returns true when balance equals amount", () => {
      expect(hasSufficientBalance(1000, 1000)).toBe(true);
    });

    test("returns false when balance is less than amount", () => {
      expect(hasSufficientBalance(500, 1000)).toBe(false);
      expect(hasSufficientBalance("500", 1000)).toBe(false);
    });

    test("returns false when balance is zero", () => {
      expect(hasSufficientBalance(0, 100)).toBe(false);
    });

    test("handles decimal amounts", () => {
      expect(hasSufficientBalance(100.50, 100.49)).toBe(true);
      expect(hasSufficientBalance(100.50, 100.51)).toBe(false);
    });
  });

  describe("formatBalance", () => {
    test("formats IDR currency by default", () => {
      const result = formatBalance(1000);
      expect(result).toContain("1.000");
      expect(result).toContain("Rp"); // IDR symbol
    });

    test("formats with custom currency", () => {
      const result = formatBalance(1000, "USD");
      expect(result).toContain("1.000"); // Indonesian locale uses dots
      expect(result).toContain("US$");
    });

    test("handles string balance", () => {
      const result = formatBalance("1000", "IDR");
      expect(result).toContain("1.000");
    });

    test("handles decimal amounts", () => {
      const result = formatBalance(1234.56, "IDR");
      expect(result).toContain("1.234,56");
    });

    test("handles zero balance", () => {
      const result = formatBalance(0, "IDR");
      expect(result).toContain("0");
    });

    test("handles negative balance", () => {
      const result = formatBalance(-1000, "IDR");
      expect(result).toContain("-");
      expect(result).toContain("1.000");
    });
  });

  describe("calculateTotalBalance", () => {
    test("sums all wallet balances", () => {
      const wallets = [
        { balance: 1000 },
        { balance: 500 },
        { balance: 250 },
      ];
      expect(calculateTotalBalance(wallets)).toBe(1750);
    });

    test("handles string balances", () => {
      const wallets = [
        { balance: "1000" },
        { balance: "500" },
      ];
      expect(calculateTotalBalance(wallets)).toBe(1500);
    });

    test("handles mixed number and string balances", () => {
      const wallets = [
        { balance: 1000 },
        { balance: "500" },
      ];
      expect(calculateTotalBalance(wallets)).toBe(1500);
    });

    test("returns 0 for empty wallet array", () => {
      expect(calculateTotalBalance([])).toBe(0);
    });

    test("handles negative balances", () => {
      const wallets = [
        { balance: 1000 },
        { balance: -300 },
        { balance: 500 },
      ];
      expect(calculateTotalBalance(wallets)).toBe(1200);
    });

    test("handles decimal balances", () => {
      const wallets = [
        { balance: 100.50 },
        { balance: 50.25 },
      ];
      expect(calculateTotalBalance(wallets)).toBe(150.75);
    });
  });

  describe("getWalletStatus", () => {
    test('returns "positive" for positive balance', () => {
      expect(getWalletStatus(100)).toBe("positive");
      expect(getWalletStatus("1000")).toBe("positive");
      expect(getWalletStatus(0.01)).toBe("positive");
    });

    test('returns "zero" for zero balance', () => {
      expect(getWalletStatus(0)).toBe("zero");
      expect(getWalletStatus("0")).toBe("zero");
    });

    test('returns "negative" for negative balance', () => {
      expect(getWalletStatus(-100)).toBe("negative");
      expect(getWalletStatus("-1000")).toBe("negative");
      expect(getWalletStatus(-0.01)).toBe("negative");
    });
  });

  describe("validateWalletName", () => {
    test("validates correct wallet names", () => {
      expect(validateWalletName("Cash").valid).toBe(true);
      expect(validateWalletName("Bank Account").valid).toBe(true);
      expect(validateWalletName("My Savings").valid).toBe(true);
    });

    test("rejects empty name", () => {
      const result = validateWalletName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("rejects whitespace-only name", () => {
      const result = validateWalletName("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("rejects too short name", () => {
      const result = validateWalletName("A");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 2 characters");
    });

    test("accepts minimum length name", () => {
      expect(validateWalletName("AB").valid).toBe(true);
    });

    test("rejects too long name", () => {
      const longName = "A".repeat(51);
      const result = validateWalletName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not exceed 50 characters");
    });

    test("accepts maximum length name", () => {
      const maxName = "A".repeat(50);
      expect(validateWalletName(maxName).valid).toBe(true);
    });

    test("trims whitespace before validation", () => {
      expect(validateWalletName("  Cash  ").valid).toBe(true);
    });
  });

  describe("calculateBalanceChangePercentage", () => {
    test("calculates increase percentage", () => {
      expect(calculateBalanceChangePercentage(1000, 1500)).toBe(50);
      expect(calculateBalanceChangePercentage(100, 200)).toBe(100);
    });

    test("calculates decrease percentage", () => {
      expect(calculateBalanceChangePercentage(1000, 500)).toBe(-50);
      expect(calculateBalanceChangePercentage(200, 100)).toBe(-50);
    });

    test("returns 0 for no change", () => {
      expect(calculateBalanceChangePercentage(1000, 1000)).toBe(0);
    });

    test("returns 100 when starting from 0 with positive new balance", () => {
      expect(calculateBalanceChangePercentage(0, 1000)).toBe(100);
    });

    test("returns 0 when both balances are 0", () => {
      expect(calculateBalanceChangePercentage(0, 0)).toBe(0);
    });

    test("rounds to 2 decimal places", () => {
      expect(calculateBalanceChangePercentage(1000, 1333)).toBe(33.3);
      expect(calculateBalanceChangePercentage(1000, 1666)).toBe(66.6);
    });

    test("handles negative old balance", () => {
      expect(calculateBalanceChangePercentage(-1000, 0)).toBe(100);
      expect(calculateBalanceChangePercentage(-1000, -500)).toBe(50);
    });
  });

  describe("groupWalletsByType", () => {
    test("groups wallets by type", () => {
      const wallets = [
        { name: "Cash", type: "cash", balance: 100 },
        { name: "Bank", type: "bank", balance: 1000 },
        { name: "Savings", type: "bank", balance: 5000 },
        { name: "Petty Cash", type: "cash", balance: 50 },
      ];

      const grouped = groupWalletsByType(wallets);

      expect(grouped.cash).toHaveLength(2);
      expect(grouped.bank).toHaveLength(2);
      expect(grouped.cash[0].name).toBe("Cash");
      expect(grouped.bank[0].name).toBe("Bank");
    });

    test("handles wallets without type", () => {
      const wallets = [
        { name: "Cash", balance: 100 },
        { name: "Bank", type: "bank", balance: 1000 },
      ];

      const grouped = groupWalletsByType(wallets);

      expect(grouped.other).toHaveLength(1);
      expect(grouped.bank).toHaveLength(1);
    });

    test("returns empty object for empty array", () => {
      const grouped = groupWalletsByType([]);
      expect(Object.keys(grouped)).toHaveLength(0);
    });

    test("handles single type", () => {
      const wallets = [
        { name: "Cash 1", type: "cash", balance: 100 },
        { name: "Cash 2", type: "cash", balance: 200 },
      ];

      const grouped = groupWalletsByType(wallets);

      expect(Object.keys(grouped)).toHaveLength(1);
      expect(grouped.cash).toHaveLength(2);
    });
  });
});
