/**
 * Metrics Utilities
 * Pure utility functions for metrics calculations and data processing
 */

import {
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";

export type ChartDataPoint = {
  name: string;
  current: number;
  average?: number;
};

export type MonthlyTotal = {
  month: string;
  total: number;
};

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

/**
 * Get default date range (last 12 months)
 */
export function getDefaultDateRange(): DateRange {
  const now = new Date();

  return {
    startDate: startOfMonth(subMonths(now, 11)),
    endDate: endOfMonth(now),
  };
}

/**
 * Parse and validate date range from ISO strings
 */
export function resolveDateRange(
  startDate?: string,
  endDate?: string,
): DateRange | null {
  const defaults = getDefaultDateRange();
  const parsedStart = startDate ? parseISO(startDate) : defaults.startDate;
  const parsedEnd = endDate ? parseISO(endDate) : defaults.endDate;

  if (!isValid(parsedStart) || !isValid(parsedEnd)) {
    return null;
  }

  const normalizedStart = startOfDay(parsedStart);
  const normalizedEnd = endOfDay(parsedEnd);

  if (normalizedStart > normalizedEnd) {
    return null;
  }

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
  };
}

/**
 * Fill missing months in time series data with zeros and calculate average
 */
export function fillMissingMonths(
  dbResults: MonthlyTotal[],
  startDate: Date,
  endDate: Date,
): ChartDataPoint[] {
  const dataMap = new Map<string, number>();
  for (const row of dbResults) {
    dataMap.set(row.month, Number(row.total || 0));
  }

  let runningTotal = 0;
  const months = eachMonthOfInterval({
    start: startOfMonth(startDate),
    end: startOfMonth(endDate),
  });

  const chartData: ChartDataPoint[] = months.map((monthDate) => {
    const monthLabel = format(monthDate, "MMM ''yy");
    const current = dataMap.get(monthLabel) || 0;

    runningTotal += current;

    return {
      name: monthLabel,
      current,
    };
  });

  if (chartData.length > 0) {
    const average = Math.round(runningTotal / chartData.length);
    for (const point of chartData) {
      point.average = average;
    }
  }

  return chartData;
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(
  oldValue: number,
  newValue: number,
): number {
  if (oldValue === 0) {
    return newValue === 0 ? 0 : 100;
  }

  const change = ((newValue - oldValue) / oldValue) * 100;
  return Math.round(change * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate growth rate across multiple periods
 */
export function calculateGrowthRate(values: number[]): number {
  if (values.length < 2) return 0;

  const validPairs: number[] = [];

  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;

    if (prev > 0) {
      validPairs.push(((curr - prev) / prev) * 100);
    }
  }

  if (validPairs.length === 0) return 0;

  const sum = validPairs.reduce((acc, val) => acc + val, 0);
  const average = sum / validPairs.length;

  return Math.round(average * 100) / 100;
}

/**
 * Aggregate data by category
 */
export function aggregateByCategory(
  data: Array<{ categoryId: string; categoryName: string; amount: number }>,
): Array<{ categoryId: string; name: string; value: number }> {
  const aggregated = new Map<string, { name: string; value: number }>();

  for (const item of data) {
    const existing = aggregated.get(item.categoryId);
    if (existing) {
      existing.value += item.amount;
    } else {
      aggregated.set(item.categoryId, {
        name: item.categoryName,
        value: item.amount,
      });
    }
  }

  return Array.from(aggregated.entries()).map(([categoryId, data]) => ({
    categoryId,
    name: data.name,
    value: Math.round(data.value * 100) / 100,
  }));
}

/**
 * Calculate total from chart data points
 */
export function calculateTotal(data: ChartDataPoint[]): number {
  const total = data.reduce((sum, point) => sum + point.current, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Find peak value and its month in chart data
 */
export function findPeak(
  data: ChartDataPoint[],
): { month: string; value: number } | null {
  if (data.length === 0) return null;

  let peak = data[0]!;
  for (const point of data) {
    if (point.current > peak.current) {
      peak = point;
    }
  }

  return {
    month: peak.name,
    value: peak.current,
  };
}
