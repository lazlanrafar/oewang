import { describe, expect, test } from "bun:test";
import {
  addMonthlyReset,
  endOfMonth,
  extractRequestedWalletName,
  formatAmount,
  hasReceiptAttachments,
  isCancelIntent,
  isConfirmIntent,
  isReceiptAttachment,
  isUuid,
  parseInputDate,
  resolveDateRange,
  resolveWalletByName,
  startOfMonth,
  toDateOnly,
  toValidIsoDate,
} from "./ai.utils";

describe("ai.utils", () => {
  describe("isUuid", () => {
    test("returns true for valid UUID", () => {
      expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
      expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    test("returns false for invalid UUID", () => {
      expect(isUuid("not-a-uuid")).toBe(false);
      expect(isUuid("123")).toBe(false);
      expect(isUuid("")).toBe(false);
      expect(isUuid("123e4567-e89b-12d3-a456")).toBe(false); // Too short
    });

    test("is case-insensitive", () => {
      expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
      expect(isUuid("123e4567-E89B-12d3-A456-426614174000")).toBe(true);
    });
  });

  describe("parseInputDate", () => {
    test("parses valid ISO date string", () => {
      const result = parseInputDate("2024-01-15");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth()).toBe(0); // January
      expect(result?.getDate()).toBe(15);
    });

    test("parses date-time string", () => {
      const result = parseInputDate("2024-01-15T10:30:00Z");
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
    });

    test("returns null for invalid date string", () => {
      expect(parseInputDate("not-a-date")).toBeNull();
      expect(parseInputDate("2024-13-40")).toBeNull(); // Invalid month/day
    });

    test("returns null for non-string input", () => {
      expect(parseInputDate(123)).toBeNull();
      expect(parseInputDate(null)).toBeNull();
      expect(parseInputDate(undefined)).toBeNull();
      expect(parseInputDate({})).toBeNull();
    });

    test("returns null for empty/whitespace string", () => {
      expect(parseInputDate("")).toBeNull();
      expect(parseInputDate("   ")).toBeNull();
    });
  });

  describe("toDateOnly", () => {
    test("formats date to YYYY-MM-DD", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      expect(toDateOnly(date)).toBe("2024-01-15");
    });

    test("handles different months", () => {
      expect(toDateOnly(new Date("2024-12-31"))).toBe("2024-12-31");
      expect(toDateOnly(new Date("2024-02-01"))).toBe("2024-02-01");
    });

    test("pads single digits", () => {
      const date = new Date("2024-01-05");
      expect(toDateOnly(date)).toBe("2024-01-05");
    });
  });

  describe("startOfMonth", () => {
    test("returns first day of month", () => {
      const date = new Date("2024-03-15");
      const result = startOfMonth(date);
      expect(result.getDate()).toBe(1);
      expect(result.getMonth()).toBe(2); // March
      expect(result.getFullYear()).toBe(2024);
    });

    test("works for different months", () => {
      expect(startOfMonth(new Date("2024-12-31")).getDate()).toBe(1);
      expect(startOfMonth(new Date("2024-01-01")).getDate()).toBe(1);
    });
  });

  describe("endOfMonth", () => {
    test("returns last day of month", () => {
      const date = new Date("2024-03-15");
      const result = endOfMonth(date);
      expect(result.getDate()).toBe(31);
      expect(result.getMonth()).toBe(2); // March
    });

    test("handles February in leap year", () => {
      const feb2024 = new Date("2024-02-15");
      expect(endOfMonth(feb2024).getDate()).toBe(29);
    });

    test("handles February in non-leap year", () => {
      const feb2023 = new Date("2023-02-15");
      expect(endOfMonth(feb2023).getDate()).toBe(28);
    });

    test("handles 30-day months", () => {
      expect(endOfMonth(new Date("2024-04-15")).getDate()).toBe(30);
      expect(endOfMonth(new Date("2024-06-15")).getDate()).toBe(30);
    });
  });

  describe("addMonthlyReset", () => {
    test("adds one month", () => {
      const date = new Date("2024-01-15");
      const result = addMonthlyReset(date);
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(15);
    });

    test("handles month-end dates", () => {
      // Jan 31 -> Feb 29 (2024 is leap year)
      const jan31 = new Date("2024-01-31");
      const result = addMonthlyReset(jan31);
      expect(result.getMonth()).toBe(1);
      expect(result.getDate()).toBe(29);
    });

    test("handles year transition", () => {
      const dec = new Date("2024-12-15");
      const result = addMonthlyReset(dec);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(15);
    });

    test("preserves day when possible", () => {
      const date = new Date("2024-03-15");
      expect(addMonthlyReset(date).getDate()).toBe(15);
    });
  });

  describe("toValidIsoDate", () => {
    test("converts valid date string to ISO", () => {
      const result = toValidIsoDate("2024-01-15");
      expect(result).toContain("2024-01-15");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("returns current date for invalid input", () => {
      const result = toValidIsoDate("invalid");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("returns current date for undefined", () => {
      const result = toValidIsoDate(undefined);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("returns current date for empty string", () => {
      const result = toValidIsoDate("");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("formatAmount", () => {
    test("formats number with Indonesian locale", () => {
      expect(formatAmount(1000)).toBe("1.000");
      expect(formatAmount(1000000)).toBe("1.000.000");
    });

    test("handles decimal numbers", () => {
      expect(formatAmount(1234.56)).toBe("1.234,56");
    });

    test("handles zero", () => {
      expect(formatAmount(0)).toBe("0");
    });

    test("handles negative numbers", () => {
      expect(formatAmount(-1000)).toBe("-1.000");
    });
  });

  describe("isReceiptAttachment", () => {
    test("returns true for PDF", () => {
      expect(isReceiptAttachment({ type: "application/pdf" })).toBe(true);
    });

    test("returns true for images", () => {
      expect(isReceiptAttachment({ type: "image/png" })).toBe(true);
      expect(isReceiptAttachment({ type: "image/jpeg" })).toBe(true);
      expect(isReceiptAttachment({ type: "image/jpg" })).toBe(true);
      expect(isReceiptAttachment({ type: "image/webp" })).toBe(true);
    });

    test("returns false for other types", () => {
      expect(isReceiptAttachment({ type: "text/plain" })).toBe(false);
      expect(isReceiptAttachment({ type: "application/json" })).toBe(false);
      expect(isReceiptAttachment({ type: "video/mp4" })).toBe(false);
    });
  });

  describe("hasReceiptAttachments", () => {
    test("returns true when array contains receipt", () => {
      expect(hasReceiptAttachments([{ type: "application/pdf" }])).toBe(true);
      expect(
        hasReceiptAttachments([{ type: "text/plain" }, { type: "image/png" }]),
      ).toBe(true);
    });

    test("returns false when no receipts", () => {
      expect(hasReceiptAttachments([{ type: "text/plain" }])).toBe(false);
    });

    test("returns false for empty array", () => {
      expect(hasReceiptAttachments([])).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(hasReceiptAttachments(undefined)).toBe(false);
    });
  });

  describe("isConfirmIntent", () => {
    test("recognizes English confirmations", () => {
      expect(isConfirmIntent("yes")).toBe(true);
      expect(isConfirmIntent("Yes")).toBe(true);
      expect(isConfirmIntent("ok")).toBe(true);
      expect(isConfirmIntent("okay")).toBe(true);
      expect(isConfirmIntent("confirm")).toBe(true);
      expect(isConfirmIntent("confirmed")).toBe(true);
      expect(isConfirmIntent("save")).toBe(true);
    });

    test("recognizes Indonesian confirmations", () => {
      expect(isConfirmIntent("ya")).toBe(true);
      expect(isConfirmIntent("simpan")).toBe(true);
      expect(isConfirmIntent("lanjut")).toBe(true);
    });

    test("works with surrounding text", () => {
      expect(isConfirmIntent("Please confirm the transaction")).toBe(true);
      expect(isConfirmIntent("Yes, I want to save it")).toBe(true);
    });

    test("returns false for non-confirmations", () => {
      expect(isConfirmIntent("no")).toBe(false);
      expect(isConfirmIntent("cancel")).toBe(false);
      expect(isConfirmIntent("maybe")).toBe(false);
      expect(isConfirmIntent("hello")).toBe(false);
    });

    test("is case-insensitive", () => {
      expect(isConfirmIntent("YES")).toBe(true);
      expect(isConfirmIntent("YeS")).toBe(true);
    });
  });

  describe("isCancelIntent", () => {
    test("recognizes English cancellations", () => {
      expect(isCancelIntent("cancel")).toBe(true);
      expect(isCancelIntent("stop")).toBe(true);
      expect(isCancelIntent("abort")).toBe(true);
    });

    test("recognizes Indonesian cancellations", () => {
      expect(isCancelIntent("batal")).toBe(true);
      expect(isCancelIntent("jangan")).toBe(true);
    });

    test("works with surrounding text", () => {
      expect(isCancelIntent("Please cancel the order")).toBe(true);
      expect(isCancelIntent("I want to stop now")).toBe(true);
    });

    test("returns false for non-cancellations", () => {
      expect(isCancelIntent("yes")).toBe(false);
      expect(isCancelIntent("confirm")).toBe(false);
      expect(isCancelIntent("hello")).toBe(false);
    });
  });

  describe("extractRequestedWalletName", () => {
    const wallets = [
      { name: "Cash" },
      { name: "Bank Account" },
      { name: "Credit Card" },
    ];

    test("extracts explicit wallet name", () => {
      expect(extractRequestedWalletName("wallet: Cash", wallets)).toBe("Cash");
      expect(extractRequestedWalletName("account: Bank Account", wallets)).toBe(
        "Bank Account",
      );
      expect(extractRequestedWalletName("akun: Cash", wallets)).toBe("Cash");
    });

    test("finds wallet by mention", () => {
      expect(extractRequestedWalletName("Pay with Cash", wallets)).toBe("Cash");
      expect(
        extractRequestedWalletName("Transfer from Bank Account", wallets),
      ).toBe("Bank Account");
    });

    test("returns undefined when no wallet found", () => {
      expect(extractRequestedWalletName("Some text", wallets)).toBeUndefined();
    });

    test("is case-insensitive", () => {
      expect(extractRequestedWalletName("pay with cash", wallets)).toBe("Cash");
      expect(extractRequestedWalletName("BANK ACCOUNT", wallets)).toBe(
        "Bank Account",
      );
    });
  });

  describe("resolveWalletByName", () => {
    const wallets = [
      { id: "1", name: "Cash" },
      { id: "2", name: "Bank Account" },
      { id: "3", name: "My Credit Card" },
    ];

    test("finds wallet by exact name", () => {
      const result = resolveWalletByName(wallets, "Cash");
      expect(result?.id).toBe("1");
    });

    test("is case-insensitive", () => {
      expect(resolveWalletByName(wallets, "cash")?.id).toBe("1");
      expect(resolveWalletByName(wallets, "CASH")?.id).toBe("1");
    });

    test("finds wallet by partial match", () => {
      expect(resolveWalletByName(wallets, "Credit")?.id).toBe("3");
      expect(resolveWalletByName(wallets, "Bank")?.id).toBe("2");
    });

    test("returns null for undefined name", () => {
      expect(resolveWalletByName(wallets, undefined)).toBeNull();
    });

    test("returns null for non-existent wallet", () => {
      expect(resolveWalletByName(wallets, "Nonexistent")).toBeNull();
    });

    test("prefers exact match over partial", () => {
      const result = resolveWalletByName(wallets, "Bank Account");
      expect(result?.id).toBe("2");
    });
  });

  describe("resolveDateRange", () => {
    test("uses custom date range when provided", () => {
      const result = resolveDateRange({
        from: "2024-01-01",
        to: "2024-01-31",
      });
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-01-31");
      expect(result.label).toBe("custom-range");
    });

    test("swaps dates if from > to", () => {
      const result = resolveDateRange({
        from: "2024-01-31",
        to: "2024-01-01",
      });
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-01-31");
    });

    test("handles custom range with only from date", () => {
      const result = resolveDateRange({
        from: "2024-01-01",
      });
      expect(result.startDate).toBe("2024-01-01");
      expect(result.label).toBe("custom-range");
    });

    test("handles custom range with only to date", () => {
      const result = resolveDateRange({
        to: "2024-01-31",
      });
      expect(result.endDate).toBe("2024-01-31");
      expect(result.label).toBe("custom-range");
    });

    test("returns this-month period", () => {
      const result = resolveDateRange({ period: "this-month" });
      expect(result.label).toBe("this-month");
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-01$/); // First of month
    });

    test("returns last-month period", () => {
      const result = resolveDateRange({ period: "last-month" });
      expect(result.label).toBe("last-month");
      expect(result.startDate).toMatch(/^\d{4}-\d{2}-01$/); // First of month
    });

    test("returns last-3-months period", () => {
      const result = resolveDateRange({ period: "last-3-months" });
      expect(result.label).toBe("last-3-months");
    });

    test("returns last-6-months period", () => {
      const result = resolveDateRange({ period: "last-6-months" });
      expect(result.label).toBe("last-6-months");
    });

    test("returns this-year period", () => {
      const result = resolveDateRange({ period: "this-year" });
      expect(result.label).toBe("this-year");
      expect(result.startDate).toMatch(/^\d{4}-01-01$/); // Jan 1
    });

    test("returns last-year period", () => {
      const result = resolveDateRange({ period: "last-year" });
      expect(result.label).toBe("last-year");
      expect(result.endDate).toMatch(/^\d{4}-12-31$/); // Dec 31
    });

    test("handles 1-year alias", () => {
      const result = resolveDateRange({ period: "1-year" });
      expect(result.label).toBe("last-12-months");
    });

    test("uses default period when no input", () => {
      const result = resolveDateRange({});
      expect(result.label).toBe("this-month");
    });

    test("handles invalid period with default", () => {
      const result = resolveDateRange({ period: "invalid" });
      expect(result.label).toBe("last-12-months");
    });

    test("all date ranges return valid ISO dates", () => {
      const periods = [
        "this-month",
        "last-month",
        "last-3-months",
        "last-6-months",
        "this-year",
        "last-year",
      ];

      for (const period of periods) {
        const result = resolveDateRange({ period });
        expect(result.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(result.startDate) <= new Date(result.endDate)).toBe(
          true,
        );
      }
    });
  });
});
