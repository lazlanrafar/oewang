/**
 * Debts Utilities
 * Pure utility functions for debt management
 */

export type DebtStatus = "unpaid" | "partial" | "paid";
export type DebtType = "payable" | "receivable";

/**
 * Calculate debt status based on remaining amount
 */
export function calculateDebtStatus(
  remainingAmount: number,
  totalAmount: number,
): DebtStatus {
  if (remainingAmount <= 0) return "paid";
  if (remainingAmount < totalAmount) return "partial";
  return "unpaid";
}

/**
 * Calculate new remaining amount after payment
 */
export function calculateRemainingAfterPayment(
  currentRemaining: number,
  paymentAmount: number,
): number {
  const newRemaining = currentRemaining - paymentAmount;
  return Math.max(0, newRemaining); // Cannot be negative
}

/**
 * Calculate remaining amount after debt amount change
 */
export function calculateRemainingAfterAmountChange(
  oldAmount: number,
  newAmount: number,
  currentRemaining: number,
): number {
  const amountDiff = newAmount - oldAmount;
  const newRemaining = currentRemaining + amountDiff;
  return Math.max(0, newRemaining); // Cannot be negative
}

/**
 * Calculate payment progress percentage
 */
export function calculatePaymentProgress(
  totalAmount: number,
  remainingAmount: number,
): number {
  if (totalAmount === 0) return 100;
  const paid = totalAmount - remainingAmount;
  return Math.round((paid / totalAmount) * 100);
}

/**
 * Check if debt is overdue
 */
export function isDebtOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  return due < now;
}

/**
 * Get days until due date
 */
export function getDaysUntilDue(
  dueDate: string | null | undefined,
): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Format debt label based on type
 */
export function formatDebtLabel(type: DebtType, contactName: string): string {
  if (type === "payable") {
    return `You owe ${contactName}`;
  }
  return `${contactName} owes you`;
}

/**
 * Validate payment amount
 */
export function validatePaymentAmount(
  paymentAmount: number,
  remainingAmount: number,
): { valid: boolean; error?: string } {
  if (paymentAmount <= 0) {
    return { valid: false, error: "Payment amount must be greater than 0" };
  }

  if (paymentAmount > remainingAmount) {
    return {
      valid: false,
      error: `Payment amount cannot exceed remaining amount (${remainingAmount})`,
    };
  }

  return { valid: true };
}

/**
 * Calculate total debt summary for a list of debts
 */
export function calculateDebtSummary(
  debts: Array<{
    type: DebtType;
    amount: number | string;
    remainingAmount: number | string;
    status: DebtStatus;
  }>,
): {
  totalPayable: number;
  totalReceivable: number;
  totalPaid: number;
  totalUnpaid: number;
} {
  let totalPayable = 0;
  let totalReceivable = 0;
  let totalPaid = 0;
  let totalUnpaid = 0;

  for (const debt of debts) {
    const amount =
      typeof debt.amount === "string" ? parseFloat(debt.amount) : debt.amount;
    const remaining =
      typeof debt.remainingAmount === "string"
        ? parseFloat(debt.remainingAmount)
        : debt.remainingAmount;

    if (debt.type === "payable") {
      totalPayable += remaining;
    } else {
      totalReceivable += remaining;
    }

    if (debt.status === "paid") {
      totalPaid += amount;
    } else {
      totalUnpaid += remaining;
    }
  }

  return {
    totalPayable,
    totalReceivable,
    totalPaid,
    totalUnpaid,
  };
}

/**
 * Split bill amount among multiple people
 */
export function splitBillAmount(
  totalAmount: number,
  numberOfPeople: number,
): number {
  if (numberOfPeople <= 0) return totalAmount;
  return Math.round((totalAmount / numberOfPeople) * 100) / 100; // Round to 2 decimals
}
