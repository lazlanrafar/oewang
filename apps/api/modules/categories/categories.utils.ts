/**
 * Categories Utilities
 * Pure utility functions for category management
 */

export type CategoryType = "income" | "expense";

/**
 * Validate category name
 */
export function validateCategoryName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Category name is required" };
  }

  if (name.trim().length < 2) {
    return { valid: false, error: "Category name must be at least 2 characters" };
  }

  if (name.length > 30) {
    return { valid: false, error: "Category name must not exceed 30 characters" };
  }

  return { valid: true };
}

/**
 * Format category display name
 */
export function formatCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " "); // Remove extra whitespace
}

/**
 * Get category icon based on name (simplified heuristic)
 */
export function getCategoryIcon(name: string, type: CategoryType): string {
  const lowerName = name.toLowerCase();

  // Common categories
  const iconMap: Record<string, string> = {
    food: "🍔",
    restaurant: "🍽️",
    groceries: "🛒",
    transport: "🚗",
    taxi: "🚕",
    shopping: "🛍️",
    entertainment: "🎬",
    health: "🏥",
    education: "📚",
    salary: "💰",
    business: "💼",
    gift: "🎁",
    rent: "🏠",
    utilities: "⚡",
    insurance: "🛡️",
    savings: "🏦",
  };

  for (const [key, icon] of Object.entries(iconMap)) {
    if (lowerName.includes(key)) return icon;
  }

  return type === "income" ? "💵" : "💸";
}

/**
 * Group categories by type
 */
export function groupCategoriesByType<T extends { type: CategoryType }>(
  categories: T[]
): { income: T[]; expense: T[] } {
  return categories.reduce(
    (groups, category) => {
      groups[category.type].push(category);
      return groups;
    },
    { income: [] as T[], expense: [] as T[] }
  );
}

/**
 * Sort categories by name
 */
export function sortCategoriesByName<T extends { name: string }>(
  categories: T[],
  order: "asc" | "desc" = "asc"
): T[] {
  return [...categories].sort((a, b) => {
    const comparison = a.name.localeCompare(b.name);
    return order === "asc" ? comparison : -comparison;
  });
}

/**
 * Check if category name is duplicate (case-insensitive)
 */
export function isDuplicateCategoryName(
  name: string,
  existingNames: string[]
): boolean {
  const lowerName = name.toLowerCase().trim();
  return existingNames.some((existing) => existing.toLowerCase() === lowerName);
}

/**
 * Get default categories for a new workspace
 */
export function getDefaultCategories(): Array<{ name: string; type: CategoryType }> {
  return [
    // Income categories
    { name: "Salary", type: "income" },
    { name: "Business", type: "income" },
    { name: "Investment", type: "income" },
    { name: "Other Income", type: "income" },
    // Expense categories
    { name: "Food & Dining", type: "expense" },
    { name: "Transportation", type: "expense" },
    { name: "Shopping", type: "expense" },
    { name: "Entertainment", type: "expense" },
    { name: "Bills & Utilities", type: "expense" },
    { name: "Healthcare", type: "expense" },
    { name: "Education", type: "expense" },
    { name: "Other Expenses", type: "expense" },
  ];
}
