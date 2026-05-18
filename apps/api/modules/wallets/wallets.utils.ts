/**
 * Wallets Utilities
 * Pure utility functions for wallet management
 */

/**
 * Calculate new balance after transaction
 */
export function calculateNewBalance(
  currentBalance: number | string,
  change: number
): number {
  const current = typeof currentBalance === "string"
    ? parseFloat(currentBalance)
    : currentBalance;
  return current + change;
}

/**
 * Check if balance is sufficient for transaction
 */
export function hasSufficientBalance(
  balance: number | string,
  amount: number
): boolean {
  const current = typeof balance === "string" ? parseFloat(balance) : balance;
  return current >= amount;
}

/**
 * Format balance for display
 */
export function formatBalance(
  balance: number | string,
  currency: string = "IDR"
): string {
  const value = typeof balance === "string" ? parseFloat(balance) : balance;

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Calculate total balance across multiple wallets
 */
export function calculateTotalBalance(
  wallets: Array<{ balance: number | string }>
): number {
  return wallets.reduce((total, wallet) => {
    const balance =
      typeof wallet.balance === "string"
        ? parseFloat(wallet.balance)
        : wallet.balance;
    return total + balance;
  }, 0);
}

/**
 * Get wallet status based on balance
 */
export function getWalletStatus(
  balance: number | string
): "positive" | "zero" | "negative" {
  const value = typeof balance === "string" ? parseFloat(balance) : balance;

  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "zero";
}

/**
 * Validate wallet name
 */
export function validateWalletName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Wallet name is required" };
  }

  if (name.trim().length < 2) {
    return { valid: false, error: "Wallet name must be at least 2 characters" };
  }

  if (name.length > 50) {
    return { valid: false, error: "Wallet name must not exceed 50 characters" };
  }

  return { valid: true };
}

/**
 * Calculate balance change percentage
 */
export function calculateBalanceChangePercentage(
  oldBalance: number,
  newBalance: number
): number {
  if (oldBalance === 0) {
    return newBalance > 0 ? 100 : 0;
  }

  const change = ((newBalance - oldBalance) / Math.abs(oldBalance)) * 100;
  return Math.round(change * 100) / 100; // Round to 2 decimals
}

/**
 * Group wallets by type
 */
export function groupWalletsByType<T extends { type?: string }>(
  wallets: T[]
): Record<string, T[]> {
  return wallets.reduce((groups, wallet) => {
    const type = wallet.type || "other";
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(wallet);
    return groups;
  }, {} as Record<string, T[]>);
}
