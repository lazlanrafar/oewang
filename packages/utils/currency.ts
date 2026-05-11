import type { CurrencyFormatOptions } from "@workspace/types";

export const CURRENCY_CONFIG: Record<
  string,
  { divisor: number; decimals: number; symbol: string; position: "Front" | "Back" }
> = {
  usd: { divisor: 100, decimals: 2, symbol: "$", position: "Front" },
  eur: { divisor: 100, decimals: 2, symbol: "€", position: "Front" },
  idr: { divisor: 1, decimals: 0, symbol: "Rp", position: "Front" },
};

export function formatCurrency(
  amount: number,
  settings?: {
    mainCurrencyCode?: string;
    mainCurrencySymbol?: string;
    mainCurrencySymbolPosition?: string;
    mainCurrencyDecimalPlaces?: number;
  } | null,
  options?: CurrencyFormatOptions,
) {
  if (!settings) {
    if (isNaN(amount)) return "—";
    return amount.toLocaleString(options?.locale || "en-US", {
      style: "currency",
      currency: "USD",
      notation: options?.compact ? "compact" : "standard",
    });
  }

  const {
    mainCurrencyCode,
    mainCurrencySymbol = "$",
    mainCurrencySymbolPosition = "Front",
    mainCurrencyDecimalPlaces = 2,
  } = settings;

  if (isNaN(amount)) return "—";

  const formattedAmount = Math.abs(amount).toLocaleString(options?.locale || "en-US", {
    minimumFractionDigits: options?.compact ? 0 : mainCurrencyDecimalPlaces,
    maximumFractionDigits: options?.compact ? 1 : mainCurrencyDecimalPlaces,
    notation: options?.compact ? "compact" : "standard",
  });

  const sign = amount < 0 ? "-" : "";
  const currencyUnit = getCurrencyDisplayUnit(mainCurrencyCode, mainCurrencySymbol);
  const separator = shouldUseCurrencySpacing(currencyUnit) ? " " : "";

  if (mainCurrencySymbolPosition === "Front") {
    return `${sign}${currencyUnit}${separator}${formattedAmount}`;
  }

  return `${sign}${formattedAmount}${separator}${currencyUnit}`;
}

export function formatPrice(
  amount: number,
  currencyCode: string,
  options?: CurrencyFormatOptions,
) {
  const config = CURRENCY_CONFIG[currencyCode.toLowerCase()] || {
    divisor: 100,
    decimals: 2,
    symbol: currencyCode.toUpperCase(),
    position: "Front",
  };

  return formatCurrency(
    amount / config.divisor,
    {
      mainCurrencyCode: currencyCode.toUpperCase(),
      mainCurrencySymbol: config.symbol,
      mainCurrencySymbolPosition: config.position,
      mainCurrencyDecimalPlaces: config.decimals,
    },
    options,
  );
}

export function formatSubunits(
  amount: number,
  currencyCode: string,
  options?: CurrencyFormatOptions,
) {
  const config = CURRENCY_CONFIG[currencyCode.toLowerCase()] || {
    symbol: currencyCode.toUpperCase(),
    position: "Front",
    decimals: 2,
    divisor: 100,
  };

  return formatCurrency(
    amount / (config.divisor ?? 100),
    {
      mainCurrencyCode: currencyCode.toUpperCase(),
      mainCurrencySymbol: config.symbol,
      mainCurrencySymbolPosition: config.position,
      mainCurrencyDecimalPlaces: config.decimals,
    },
    options,
  );
}

export function getCurrencyDisplayUnit(
  currencyCode?: string | null,
  currencySymbol?: string | null,
) {
  return currencyCode?.toUpperCase() || currencySymbol || "$";
}

function shouldUseCurrencySpacing(currencyUnit: string) {
  return /[A-Za-z]/.test(currencyUnit);
}
