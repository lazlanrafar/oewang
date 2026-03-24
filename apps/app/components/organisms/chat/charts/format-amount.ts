/**
 * Local currency formatting helper for chart components.
 * Uses Intl.NumberFormat for consistent formatting.
 * The canvas components pass in the currency-string from AI data
 * (e.g., "USD", "IDR") so we don't need to reach into the Zustand store here.
 */
export function formatAmount({
  amount,
  currency = "USD",
  locale,
  maximumFractionDigits = 2,
  minimumFractionDigits = 0,
}: {
  amount: number;
  currency?: string;
  locale?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}): string {
  try {
    return new Intl.NumberFormat(locale || "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits,
      minimumFractionDigits,
    }).format(amount);
  } catch {
    // Fallback for unknown currencies
    return `${currency} ${amount.toLocaleString(locale || "en-US", {
      minimumFractionDigits,
      maximumFractionDigits,
    })}`;
  }
}
