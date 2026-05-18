/**
 * Transaction Utilities
 * Pure utility functions for transaction processing
 */

/**
 * Sanitize amount - convert to string if number
 */
export function sanitizeAmount(amount: number | string): string {
  return typeof amount === "number" ? amount.toString() : amount;
}

/**
 * Calculate wallet balance change based on transaction type
 */
export function calculateBalanceChange(
  type: "expense" | "income" | "transfer",
  amount: number,
  walletRole: "from" | "to"
): number {
  if (type === "expense") {
    return -amount; // Deduct from wallet
  } else if (type === "income") {
    return amount; // Add to wallet
  } else if (type === "transfer") {
    return walletRole === "from" ? -amount : amount;
  }
  return 0;
}

/**
 * Check if budget is exceeded
 */
export function isBudgetExceeded(spent: number, budgetAmount: number): boolean {
  return spent >= budgetAmount;
}

/**
 * Calculate budget usage percentage
 */
export function calculateBudgetUsage(spent: number, budgetAmount: number): number {
  if (budgetAmount === 0) return 0;
  return Math.round((spent / budgetAmount) * 100);
}

/**
 * Get budget status based on usage
 */
export function getBudgetStatus(
  spent: number,
  budgetAmount: number
): "safe" | "warning" | "exceeded" {
  const usage = calculateBudgetUsage(spent, budgetAmount);
  if (usage >= 100) return "exceeded";
  if (usage >= 80) return "warning";
  return "safe";
}

/**
 * Format transaction amount for display
 */
export function formatTransactionAmount(
  amount: number | string,
  type: "expense" | "income" | "transfer"
): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = value.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  if (type === "expense") {
    return `-${formatted}`;
  } else if (type === "income") {
    return `+${formatted}`;
  }
  return formatted;
}

/**
 * Validate transaction amount
 */
export function validateTransactionAmount(amount: number | string): {
  valid: boolean;
  error?: string;
} {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(value)) {
    return { valid: false, error: "Amount must be a valid number" };
  }

  if (value <= 0) {
    return { valid: false, error: "Amount must be greater than 0" };
  }

  if (value > 999999999999) {
    return { valid: false, error: "Amount is too large" };
  }

  return { valid: true };
}

/**
 * Get current month date range
 */
export function getCurrentMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endDate = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  ).toISOString();
  return { startDate, endDate };
}
