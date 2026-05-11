import { MetricsRepository } from "./metrics.repository";
import { buildSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
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
import type { ChartDataPoint } from "./metrics.dto";

export abstract class MetricsService {
  private static getDefaultDateRange() {
    const now = new Date();

    return {
      startDate: startOfMonth(subMonths(now, 11)),
      endDate: endOfMonth(now),
    };
  }

  private static resolveDateRange(startDate?: string, endDate?: string) {
    const defaults = MetricsService.getDefaultDateRange();
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

  private static fillMissingMonths(
    dbResults: { month: string; total: number }[],
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

  static async getRevenue(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const range = MetricsService.resolveDateRange(startDate, endDate);

    if (!range) {
      return buildError(ErrorCode.VALIDATION_ERROR, "Invalid date range");
    }

    const rawData = await MetricsRepository.getMonthlyTotalsByType(
      workspaceId,
      "income",
      range.startDate,
      range.endDate,
    );

    const formatted = MetricsService.fillMissingMonths(
      rawData,
      range.startDate,
      range.endDate,
    );

    return buildSuccess(formatted, "Revenue metrics retrieved");
  }

  static async getExpenses(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const range = MetricsService.resolveDateRange(startDate, endDate);

    if (!range) {
      return buildError(ErrorCode.VALIDATION_ERROR, "Invalid date range");
    }

    const rawData = await MetricsRepository.getMonthlyTotalsByType(
      workspaceId,
      "expense",
      range.startDate,
      range.endDate,
    );

    const formatted = MetricsService.fillMissingMonths(
      rawData,
      range.startDate,
      range.endDate,
    );

    return buildSuccess(formatted, "Expenses metrics retrieved");
  }

  static async getBurnRate(
    workspaceId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const range = MetricsService.resolveDateRange(startDate, endDate);

    if (!range) {
      return buildError(ErrorCode.VALIDATION_ERROR, "Invalid date range");
    }

    const rawData = await MetricsRepository.getMonthlyTotalsByType(
      workspaceId,
      "expense",
      range.startDate,
      range.endDate,
    );

    const formatted = MetricsService.fillMissingMonths(
      rawData,
      range.startDate,
      range.endDate,
    );

    return buildSuccess(formatted);
  }

  static async getCategoryBreakdown(
    workspaceId: string,
    type: "income" | "expense" = "expense",
    startDate?: string,
    endDate?: string,
  ) {
    const range = MetricsService.resolveDateRange(startDate, endDate);

    if (!range) {
      return buildError(ErrorCode.VALIDATION_ERROR, "Invalid date range");
    }

    const rawData = await MetricsRepository.getCategoryBreakdown(
      workspaceId,
      type,
      range.startDate,
      range.endDate,
    );

    const formatted = rawData.map((row) => ({
      categoryId: row.categoryId,
      name: row.categoryName,
      value: Number(row.total || 0),
    }));

    return buildSuccess(formatted, "Category breakdown retrieved");
  }
}
