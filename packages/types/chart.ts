import type { ReactNode } from "react";

export interface BaseChartProps {
  data: Record<string, unknown>[];
  height?: number;
  className?: string;
  showAnimation?: boolean;
}

export interface RevenueData extends Record<string, unknown> {
  month: string;
  revenue: number;
  target?: number;
}

export interface RevenueChartProps extends BaseChartProps {
  data: RevenueData[];
  showTarget?: boolean;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  title?: string;
}

export interface ExpenseData extends Record<string, unknown> {
  month: string;
  amount: number;
  category: string;
}

export interface CategoryData extends Record<string, unknown> {
  name: string;
  value: number;
  color: string;
}

export interface ExpensesChartProps extends BaseChartProps {
  data: ExpenseData[];
  categoryData?: CategoryData[];
  chartType?: "bar" | "pie";
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  valueLabel?: string;
  title?: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
}

export interface RunwayData extends Record<string, unknown> {
  month: string;
  cashRemaining: number;
  burnRate: number;
  projectedCash?: number;
  runwayMonths?: number;
}

export interface RunwayChartProps extends BaseChartProps {
  data: RunwayData[];
  showProjection?: boolean;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  displayMode?: "currency" | "months";
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
}

export interface BurnRateData extends Record<string, unknown> {
  month: string;
  amount: number;
  average: number;
  currentBurn: number;
  averageBurn: number;
}

export interface BurnRateChartProps {
  data: BurnRateData[];
  height?: number;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
}

export interface CashFlowData extends Record<string, unknown> {
  month: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  cumulativeFlow: number;
}

export interface CashFlowChartProps extends BaseChartProps {
  data: CashFlowData[];
  showCumulative?: boolean;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
}

export interface ProjectedCashBalanceData extends Record<string, unknown> {
  month: number;
  baseCase: number;
  worstCase: number;
  bestCase: number;
}

export interface StressTestChartProps extends BaseChartProps {
  projectedCashBalance: ProjectedCashBalanceData[];
  currency?: string;
  locale?: string;
}

export interface MonthlyRevenueData extends Record<string, unknown> {
  month: string;
  amount: number;
  lastYearAmount: number;
  average: number;
  currentRevenue: number;
  lastYearRevenue: number;
  averageRevenue: number;
}

export interface MonthlyRevenueChartProps {
  data: MonthlyRevenueData[];
  height?: number;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
}

export interface CategoryExpenseData extends Record<string, unknown> {
  category: string;
  amount: number;
  percentage: number;
  color?: string;
}

export interface CategoryExpenseDonutChartProps {
  data: CategoryExpenseData[];
  currency?: string;
  locale?: string;
  height?: number;
  className?: string;
}

export interface GrowthRateData extends Record<string, unknown> {
  period: string;
  currentTotal: number;
  previousTotal: number;
  growthRate: number;
}

export interface GrowthRateChartProps {
  data: GrowthRateData[];
  height?: number;
  currency?: string;
  locale?: string;
}

export interface RevenueTrendData extends Record<string, unknown> {
  month: string;
  revenue: number;
  lastYearRevenue: number;
  average: number;
}

export interface RevenueTrendChartProps {
  data: RevenueTrendData[];
  height?: number;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
}

export interface ProfitData extends Record<string, unknown> {
  month: string;
  profit: number;
  lastYearProfit: number;
  average: number;
  revenue?: number;
  expenses?: number;
  lastYearRevenue?: number;
  lastYearExpenses?: number;
}

export interface ProfitChartProps {
  data: ProfitData[];
  height?: number;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
}

export interface BusinessHealthScoreData extends Record<string, unknown> {
  month: string;
  healthScore: number;
}

export interface BusinessHealthScoreChartProps {
  data: BusinessHealthScoreData[];
  height?: number;
}

export interface InvoicePaymentData extends Record<string, unknown> {
  month: string;
  averageDaysToPay: number;
  paymentRate: number;
}

export interface InvoicePaymentChartProps extends BaseChartProps {
  data: InvoicePaymentData[];
  locale?: string;
}

export interface StackedBarItem extends Record<string, unknown> {
  date: string;
  value: number;
  recurring: number;
  total: number;
}

export interface StackedBarData {
  result: StackedBarItem[];
  meta?: Record<string, unknown>;
}

export interface StackedBarChartProps extends Omit<BaseChartProps, "data"> {
  data: StackedBarData;
  locale?: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
}

export interface ForecastBreakdown {
  recurringInvoices: number;
  recurringTransactions: number;
  scheduled: number;
  collections: number;
  billableHours: number;
  newBusiness: number;
}

export interface ForecastData extends Record<string, unknown> {
  month: string;
  actual?: number | null;
  forecasted?: number | null;
  date?: string;
  optimistic?: number | null;
  pessimistic?: number | null;
  confidence?: number | null;
  breakdown?: ForecastBreakdown | null;
}

export interface RevenueForecastChartProps extends Omit<BaseChartProps, "data"> {
  data?: ForecastData[];
  currency?: string;
  locale?: string;
  forecastStartIndex?: number;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string, chartType: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
  height?: number;
}

export interface TaxTrendData extends Record<string, unknown> {
  month: string;
  taxAmount: number;
  taxableIncome: number;
}

export interface TaxTrendChartProps {
  data: TaxTrendData[];
  height?: number;
  showLegend?: boolean;
  currency?: string;
  locale?: string;
}

export interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | string; payload?: any }>;
  label?: string | number;
  currency?: string;
  locale?: string;
}
