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
    mainCurrencySymbol?: string;
    mainCurrencySymbolPosition?: string;
    mainCurrencyDecimalPlaces?: number;
  } | null,
  options?: {
    compact?: boolean;
  },
) {
  if (!settings) {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      notation: options?.compact ? "compact" : "standard",
    });
  }

  const {
    mainCurrencySymbol = "$",
    mainCurrencySymbolPosition = "Front",
    mainCurrencyDecimalPlaces = 2,
  } = settings;

  const formattedAmount = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: options?.compact ? 0 : mainCurrencyDecimalPlaces,
    maximumFractionDigits: options?.compact ? 1 : mainCurrencyDecimalPlaces,
    notation: options?.compact ? "compact" : "standard",
  });

  const sign = amount < 0 ? "-" : "";

  if (mainCurrencySymbolPosition === "Front") {
    return `${sign}${mainCurrencySymbol}${formattedAmount}`;
  }

  return `${sign}${formattedAmount}${mainCurrencySymbol}`;
}

export function formatPrice(
  amount: number,
  currencyCode: string,
  options?: { compact?: boolean },
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
  options?: { compact?: boolean },
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
      mainCurrencySymbol: config.symbol,
      mainCurrencySymbolPosition: config.position,
      mainCurrencyDecimalPlaces: config.decimals,
    },
    options,
  );
}
