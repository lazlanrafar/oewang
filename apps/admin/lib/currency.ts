import type { TransactionSettings } from "@/types/settings";

export function formatCurrency(amount: number, settings: TransactionSettings | null | undefined) {
  if (!settings) {
    // Fallback to a basic formatter if settings aren't loaded yet
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }

  const { mainCurrencySymbol, mainCurrencySymbolPosition, mainCurrencyDecimalPlaces } = settings;

  const formattedAmount = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: mainCurrencyDecimalPlaces,
    maximumFractionDigits: mainCurrencyDecimalPlaces,
  });

  const sign = amount < 0 ? "-" : "";

  if (mainCurrencySymbolPosition === "Front") {
    return `${sign}${mainCurrencySymbol}${formattedAmount}`;
  }

  return `${sign}${formattedAmount}${mainCurrencySymbol}`;
}
