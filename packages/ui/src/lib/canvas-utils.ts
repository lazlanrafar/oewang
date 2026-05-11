import { formatCurrency } from "./utils";

export function formatCurrencyAmount(amount: number, currency: string, locale?: string) {
  // Simple wrapper or implementation for canvas specific formatting
  return formatCurrency(amount, {
    mainCurrencyCode: currency,
    mainCurrencySymbol: currency === "USD" ? "$" : currency,
    mainCurrencySymbolPosition: "Front",
    mainCurrencyDecimalPlaces: 2
  });
}

export function shouldShowChart(stage?: string) {
  return (
    stage === "chart" ||
    stage === "complete" ||
    stage === "chart_ready" ||
    stage === "metrics_ready" ||
    stage === "analysis_ready"
  );
}

export function shouldShowMetricsSkeleton(stage?: string) {
  return stage === "loading" || stage === "parsing";
}

export function shouldShowSummarySkeleton(stage?: string) {
  return stage !== "complete" && stage !== "analysis_ready";
}
