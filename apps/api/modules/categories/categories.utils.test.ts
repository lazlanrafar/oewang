import { describe, test, expect } from "bun:test";
import {
  validateCategoryName,
  formatCategoryName,
  getCategoryIcon,
  groupCategoriesByType,
  sortCategoriesByName,
  isDuplicateCategoryName,
  getDefaultCategories,
} from "./categories.utils";

describe("categories.utils", () => {
  describe("validateCategoryName", () => {
    test("validates correct names", () => {
      expect(validateCategoryName("Food").valid).toBe(true);
      expect(validateCategoryName("Transportation").valid).toBe(true);
    });

    test("rejects empty name", () => {
      const result = validateCategoryName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("rejects whitespace-only name", () => {
      const result = validateCategoryName("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    test("rejects too short name", () => {
      const result = validateCategoryName("A");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least 2 characters");
    });

    test("accepts minimum length", () => {
      expect(validateCategoryName("AB").valid).toBe(true);
    });

    test("rejects too long name", () => {
      const longName = "A".repeat(31);
      const result = validateCategoryName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("not exceed 30 characters");
    });

    test("accepts maximum length", () => {
      const maxName = "A".repeat(30);
      expect(validateCategoryName(maxName).valid).toBe(true);
    });
  });

  describe("formatCategoryName", () => {
    test("removes extra whitespace", () => {
      expect(formatCategoryName("Food   &   Dining")).toBe("Food & Dining");
      expect(formatCategoryName("   Transportation   ")).toBe("Transportation");
    });

    test("collapses multiple spaces", () => {
      expect(formatCategoryName("Food     and    Drink")).toBe("Food and Drink");
    });

    test("handles already formatted names", () => {
      expect(formatCategoryName("Food")).toBe("Food");
    });
  });

  describe("getCategoryIcon", () => {
    test("returns food icon for food-related categories", () => {
      expect(getCategoryIcon("Food & Dining", "expense")).toBe("🍔");
      expect(getCategoryIcon("Restaurant", "expense")).toBe("🍽️");
      expect(getCategoryIcon("Groceries", "expense")).toBe("🛒");
    });

    test("returns transport icon for transport categories", () => {
      expect(getCategoryIcon("Transportation", "expense")).toBe("🚗");
      expect(getCategoryIcon("Taxi", "expense")).toBe("🚕");
    });

    test("returns shopping icon for shopping", () => {
      expect(getCategoryIcon("Shopping", "expense")).toBe("🛍️");
    });

    test("returns default income icon for unknown income category", () => {
      expect(getCategoryIcon("Random Income", "income")).toBe("💵");
    });

    test("returns default expense icon for unknown expense category", () => {
      expect(getCategoryIcon("Random Expense", "expense")).toBe("💸");
    });

    test("is case-insensitive", () => {
      expect(getCategoryIcon("FOOD", "expense")).toBe("🍔");
      expect(getCategoryIcon("food", "expense")).toBe("🍔");
    });
  });

  describe("groupCategoriesByType", () => {
    test("groups categories by income and expense", () => {
      const categories = [
        { name: "Salary", type: "income" as const },
        { name: "Food", type: "expense" as const },
        { name: "Business", type: "income" as const },
        { name: "Transport", type: "expense" as const },
      ];

      const grouped = groupCategoriesByType(categories);

      expect(grouped.income).toHaveLength(2);
      expect(grouped.expense).toHaveLength(2);
      expect(grouped.income[0].name).toBe("Salary");
      expect(grouped.expense[0].name).toBe("Food");
    });

    test("handles all income categories", () => {
      const categories = [
        { name: "Salary", type: "income" as const },
        { name: "Business", type: "income" as const },
      ];

      const grouped = groupCategoriesByType(categories);

      expect(grouped.income).toHaveLength(2);
      expect(grouped.expense).toHaveLength(0);
    });

    test("handles all expense categories", () => {
      const categories = [
        { name: "Food", type: "expense" as const },
        { name: "Transport", type: "expense" as const },
      ];

      const grouped = groupCategoriesByType(categories);

      expect(grouped.income).toHaveLength(0);
      expect(grouped.expense).toHaveLength(2);
    });

    test("handles empty array", () => {
      const grouped = groupCategoriesByType([]);

      expect(grouped.income).toHaveLength(0);
      expect(grouped.expense).toHaveLength(0);
    });
  });

  describe("sortCategoriesByName", () => {
    test("sorts categories ascending by default", () => {
      const categories = [
        { name: "Zebra" },
        { name: "Apple" },
        { name: "Mango" },
      ];

      const sorted = sortCategoriesByName(categories);

      expect(sorted[0].name).toBe("Apple");
      expect(sorted[1].name).toBe("Mango");
      expect(sorted[2].name).toBe("Zebra");
    });

    test("sorts categories descending", () => {
      const categories = [
        { name: "Apple" },
        { name: "Zebra" },
        { name: "Mango" },
      ];

      const sorted = sortCategoriesByName(categories, "desc");

      expect(sorted[0].name).toBe("Zebra");
      expect(sorted[1].name).toBe("Mango");
      expect(sorted[2].name).toBe("Apple");
    });

    test("does not mutate original array", () => {
      const categories = [{ name: "B" }, { name: "A" }];
      const original = [...categories];

      sortCategoriesByName(categories);

      expect(categories).toEqual(original);
    });

    test("handles empty array", () => {
      expect(sortCategoriesByName([])).toEqual([]);
    });

    test("sorts using locale compare", () => {
      const categories = [
        { name: "banana" },
        { name: "Apple" },
        { name: "cherry" },
      ];

      const sorted = sortCategoriesByName(categories);

      // localeCompare is case-insensitive by default
      expect(sorted[0].name).toBe("Apple");
      expect(sorted[1].name).toBe("banana");
      expect(sorted[2].name).toBe("cherry");
    });
  });

  describe("isDuplicateCategoryName", () => {
    test("detects exact duplicates", () => {
      expect(isDuplicateCategoryName("Food", ["Food", "Transport"])).toBe(true);
    });

    test("is case-insensitive", () => {
      expect(isDuplicateCategoryName("FOOD", ["food", "transport"])).toBe(true);
      expect(isDuplicateCategoryName("food", ["Food", "Transport"])).toBe(true);
    });

    test("trims whitespace", () => {
      expect(isDuplicateCategoryName("  Food  ", ["Food"])).toBe(true);
    });

    test("returns false for non-duplicates", () => {
      expect(isDuplicateCategoryName("Food", ["Transport", "Shopping"])).toBe(false);
    });

    test("returns false for empty existing names", () => {
      expect(isDuplicateCategoryName("Food", [])).toBe(false);
    });

    test("handles partial matches as non-duplicates", () => {
      expect(isDuplicateCategoryName("Food", ["Food & Dining"])).toBe(false);
    });
  });

  describe("getDefaultCategories", () => {
    test("returns an array of categories", () => {
      const categories = getDefaultCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });

    test("includes both income and expense categories", () => {
      const categories = getDefaultCategories();
      const hasIncome = categories.some((c) => c.type === "income");
      const hasExpense = categories.some((c) => c.type === "expense");

      expect(hasIncome).toBe(true);
      expect(hasExpense).toBe(true);
    });

    test("includes common income categories", () => {
      const categories = getDefaultCategories();
      const names = categories.map((c) => c.name);

      expect(names).toContain("Salary");
      expect(names).toContain("Business");
    });

    test("includes common expense categories", () => {
      const categories = getDefaultCategories();
      const names = categories.map((c) => c.name);

      expect(names).toContain("Food & Dining");
      expect(names).toContain("Transportation");
    });

    test("all categories have name and type", () => {
      const categories = getDefaultCategories();

      categories.forEach((category) => {
        expect(category.name).toBeDefined();
        expect(category.type).toBeDefined();
        expect(["income", "expense"]).toContain(category.type);
      });
    });

    test("returns same categories on each call", () => {
      const first = getDefaultCategories();
      const second = getDefaultCategories();

      expect(first).toEqual(second);
    });
  });
});
