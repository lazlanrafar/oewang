import { describe, test, expect } from "bun:test";
import {
  getDefaultDateRange,
  resolveDateRange,
  fillMissingMonths,
  calculatePercentageChange,
  calculateGrowthRate,
  aggregateByCategory,
  calculateTotal,
  findPeak,
} from "./metrics.utils";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

describe("metrics.utils", () => {
  describe("getDefaultDateRange", () => {
    test("returns 12-month range", () => {
      const range = getDefaultDateRange();
      const now = new Date();

      expect(range.startDate).toEqual(startOfMonth(subMonths(now, 11)));
      expect(range.endDate).toEqual(endOfMonth(now));
    });

    test("start date is before end date", () => {
      const range = getDefaultDateRange();
      expect(range.startDate < range.endDate).toBe(true);
    });

    test("range starts at month beginning", () => {
      const range = getDefaultDateRange();
      expect(range.startDate.getDate()).toBe(1);
      expect(range.startDate.getHours()).toBe(0);
      expect(range.startDate.getMinutes()).toBe(0);
    });

    test("range ends at month end", () => {
      const range = getDefaultDateRange();
      const now = new Date();
      const lastDay = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).getDate();

      expect(range.endDate.getDate()).toBe(lastDay);
    });
  });

  describe("resolveDateRange", () => {
    test("uses defaults when no dates provided", () => {
      const result = resolveDateRange();
      const defaults = getDefaultDateRange();

      expect(result).not.toBeNull();
      expect(result?.startDate.getTime()).toBe(defaults.startDate.getTime());
    });

    test("parses valid ISO date strings", () => {
      const result = resolveDateRange("2024-01-01", "2024-12-31");

      expect(result).not.toBeNull();
      expect(result?.startDate.getFullYear()).toBe(2024);
      expect(result?.startDate.getMonth()).toBe(0); // January
      expect(result?.endDate.getMonth()).toBe(11); // December
    });

    test("normalizes to start and end of day", () => {
      const result = resolveDateRange("2024-01-15", "2024-01-20");

      expect(result?.startDate.getHours()).toBe(0);
      expect(result?.startDate.getMinutes()).toBe(0);
      expect(result?.endDate.getHours()).toBe(23);
      expect(result?.endDate.getMinutes()).toBe(59);
    });

    test("returns null for invalid dates", () => {
      expect(resolveDateRange("invalid", "2024-12-31")).toBeNull();
      expect(resolveDateRange("2024-01-01", "invalid")).toBeNull();
      expect(resolveDateRange("not-a-date", "also-invalid")).toBeNull();
    });

    test("returns null when start is after end", () => {
      const result = resolveDateRange("2024-12-31", "2024-01-01");
      expect(result).toBeNull();
    });

    test("accepts same start and end date", () => {
      const result = resolveDateRange("2024-06-15", "2024-06-15");
      expect(result).not.toBeNull();
    });
  });

  describe("fillMissingMonths", () => {
    test("fills single month with data", () => {
      const start = new Date("2024-01-01");
      const end = new Date("2024-01-31");
      const data = [{ month: "Jan '24", total: 1000 }];

      const result = fillMissingMonths(data, start, end);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Jan '24");
      expect(result[0].current).toBe(1000);
    });

    test("fills missing months with zero", () => {
      const start = new Date("2024-01-01");
      const end = new Date("2024-03-31");
      const data = [
        { month: "Jan '24", total: 1000 },
        { month: "Mar '24", total: 1500 },
      ];

      const result = fillMissingMonths(data, start, end);

      expect(result).toHaveLength(3);
      expect(result[0].current).toBe(1000);
      expect(result[1].current).toBe(0); // Feb missing
      expect(result[2].current).toBe(1500);
    });

    test("calculates average across all months", () => {
      const start = new Date("2024-01-01");
      const end = new Date("2024-04-30");
      const data = [
        { month: "Jan '24", total: 100 },
        { month: "Feb '24", total: 200 },
        { month: "Mar '24", total: 300 },
        { month: "Apr '24", total: 400 },
      ];

      const result = fillMissingMonths(data, start, end);

      // Average = (100 + 200 + 300 + 400) / 4 = 250
      expect(result[0].average).toBe(250);
      expect(result[1].average).toBe(250);
      expect(result[2].average).toBe(250);
      expect(result[3].average).toBe(250);
    });

    test("handles empty data array", () => {
      const start = new Date("2024-01-01");
      const end = new Date("2024-03-31");

      const result = fillMissingMonths([], start, end);

      expect(result).toHaveLength(3);
      expect(result[0].current).toBe(0);
      expect(result[1].current).toBe(0);
      expect(result[2].current).toBe(0);
      expect(result[0].average).toBe(0);
    });

    test("rounds average to nearest integer", () => {
      const start = new Date("2024-01-01");
      const end = new Date("2024-03-31");
      const data = [
        { month: "Jan '24", total: 100 },
        { month: "Feb '24", total: 150 },
        { month: "Mar '24", total: 200 },
      ];

      const result = fillMissingMonths(data, start, end);

      // Average = (100 + 150 + 200) / 3 = 150
      expect(result[0].average).toBe(150);
    });
  });

  describe("calculatePercentageChange", () => {
    test("calculates positive change", () => {
      expect(calculatePercentageChange(100, 150)).toBe(50);
      expect(calculatePercentageChange(200, 250)).toBe(25);
    });

    test("calculates negative change", () => {
      expect(calculatePercentageChange(150, 100)).toBe(-33.33);
      expect(calculatePercentageChange(200, 150)).toBe(-25);
    });

    test("returns 0 for no change", () => {
      expect(calculatePercentageChange(100, 100)).toBe(0);
    });

    test("handles zero old value", () => {
      expect(calculatePercentageChange(0, 100)).toBe(100);
      expect(calculatePercentageChange(0, 0)).toBe(0);
    });

    test("rounds to 2 decimal places", () => {
      expect(calculatePercentageChange(3, 10)).toBe(233.33);
      expect(calculatePercentageChange(7, 11)).toBe(57.14);
    });

    test("handles decimal values", () => {
      expect(calculatePercentageChange(12.5, 15.0)).toBe(20);
      expect(calculatePercentageChange(99.99, 100.01)).toBe(0.02);
    });
  });

  describe("calculateGrowthRate", () => {
    test("calculates positive growth rate", () => {
      const values = [100, 110, 121];
      expect(calculateGrowthRate(values)).toBe(10);
    });

    test("calculates negative growth rate", () => {
      const values = [100, 90, 81];
      expect(calculateGrowthRate(values)).toBe(-10);
    });

    test("calculates mixed growth rate", () => {
      const values = [100, 120, 100, 110];
      // Changes: +20%, -16.67%, +10% = average 4.44%
      const result = calculateGrowthRate(values);
      expect(result).toBeCloseTo(4.44, 1);
    });

    test("returns 0 for single value", () => {
      expect(calculateGrowthRate([100])).toBe(0);
    });

    test("returns 0 for empty array", () => {
      expect(calculateGrowthRate([])).toBe(0);
    });

    test("skips periods with zero previous value", () => {
      const values = [0, 100, 200];
      // Only calculates 100->200 = +100%
      expect(calculateGrowthRate(values)).toBe(100);
    });

    test("handles all zero values", () => {
      expect(calculateGrowthRate([0, 0, 0])).toBe(0);
    });
  });

  describe("aggregateByCategory", () => {
    test("aggregates single category", () => {
      const data = [
        {
          categoryId: "cat1",
          categoryName: "Food",
          amount: 100,
        },
      ];

      const result = aggregateByCategory(data);

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe("cat1");
      expect(result[0].name).toBe("Food");
      expect(result[0].value).toBe(100);
    });

    test("aggregates duplicate categories", () => {
      const data = [
        { categoryId: "cat1", categoryName: "Food", amount: 100 },
        { categoryId: "cat1", categoryName: "Food", amount: 150 },
        { categoryId: "cat1", categoryName: "Food", amount: 50 },
      ];

      const result = aggregateByCategory(data);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe(300);
    });

    test("separates different categories", () => {
      const data = [
        { categoryId: "cat1", categoryName: "Food", amount: 100 },
        { categoryId: "cat2", categoryName: "Transport", amount: 50 },
        { categoryId: "cat3", categoryName: "Shopping", amount: 200 },
      ];

      const result = aggregateByCategory(data);

      expect(result).toHaveLength(3);
      expect(result.find((r) => r.categoryId === "cat1")?.value).toBe(100);
      expect(result.find((r) => r.categoryId === "cat2")?.value).toBe(50);
      expect(result.find((r) => r.categoryId === "cat3")?.value).toBe(200);
    });

    test("rounds values to 2 decimals", () => {
      const data = [
        { categoryId: "cat1", categoryName: "Food", amount: 10.555 },
        { categoryId: "cat1", categoryName: "Food", amount: 20.666 },
      ];

      const result = aggregateByCategory(data);

      expect(result[0].value).toBe(31.22);
    });

    test("handles empty array", () => {
      const result = aggregateByCategory([]);
      expect(result).toHaveLength(0);
    });
  });

  describe("calculateTotal", () => {
    test("calculates sum of current values", () => {
      const data = [
        { name: "Jan", current: 100 },
        { name: "Feb", current: 200 },
        { name: "Mar", current: 300 },
      ];

      expect(calculateTotal(data)).toBe(600);
    });

    test("ignores average values", () => {
      const data = [
        { name: "Jan", current: 100, average: 50 },
        { name: "Feb", current: 200, average: 50 },
      ];

      expect(calculateTotal(data)).toBe(300);
    });

    test("returns 0 for empty array", () => {
      expect(calculateTotal([])).toBe(0);
    });

    test("handles decimal values", () => {
      const data = [
        { name: "Jan", current: 10.55 },
        { name: "Feb", current: 20.66 },
      ];

      expect(calculateTotal(data)).toBe(31.21);
    });

    test("handles zero values", () => {
      const data = [
        { name: "Jan", current: 0 },
        { name: "Feb", current: 0 },
      ];

      expect(calculateTotal(data)).toBe(0);
    });
  });

  describe("findPeak", () => {
    test("finds highest value", () => {
      const data = [
        { name: "Jan", current: 100 },
        { name: "Feb", current: 300 },
        { name: "Mar", current: 200 },
      ];

      const result = findPeak(data);

      expect(result).not.toBeNull();
      expect(result?.month).toBe("Feb");
      expect(result?.value).toBe(300);
    });

    test("returns first peak if multiple equal peaks", () => {
      const data = [
        { name: "Jan", current: 300 },
        { name: "Feb", current: 100 },
        { name: "Mar", current: 300 },
      ];

      const result = findPeak(data);

      expect(result?.month).toBe("Jan");
      expect(result?.value).toBe(300);
    });

    test("returns null for empty array", () => {
      expect(findPeak([])).toBeNull();
    });

    test("handles single data point", () => {
      const data = [{ name: "Jan", current: 100 }];

      const result = findPeak(data);

      expect(result?.month).toBe("Jan");
      expect(result?.value).toBe(100);
    });

    test("handles zero values", () => {
      const data = [
        { name: "Jan", current: 0 },
        { name: "Feb", current: 0 },
      ];

      const result = findPeak(data);

      expect(result?.month).toBe("Jan");
      expect(result?.value).toBe(0);
    });

    test("handles negative values", () => {
      const data = [
        { name: "Jan", current: -50 },
        { name: "Feb", current: -20 },
        { name: "Mar", current: -100 },
      ];

      const result = findPeak(data);

      expect(result?.month).toBe("Feb");
      expect(result?.value).toBe(-20);
    });
  });
});
