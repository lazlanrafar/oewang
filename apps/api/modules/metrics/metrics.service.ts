import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
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
import { cacheDel, getOrSet } from "../../lib/cache";
import type { ChartDataPoint } from "./metrics.dto";
import { MetricsRepository } from "./metrics.repository";

const METRICS_TTL = 60 * 60; // 1h
// Only the default dashboard range is cached. Custom user-picked ranges return
// null here so they compute fresh — otherwise their keys would never be cleared
// by invalidateWorkspaceCache and could serve stale data for up to METRICS_TTL.
const metricsKey = (
  workspaceId: string,
  type: string,
  start?: string,
  end?: string,
): string | null =>
  start || end ? null : `oewang:metrics:${workspaceId}:${type}:d:d`;

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

    const key = metricsKey(workspaceId, "revenue", startDate, endDate);
    const formatted = await getOrSet(key, METRICS_TTL, async () => {
      const rawData = await MetricsRepository.getMonthlyTotalsByType(
        workspaceId,
        "income",
        range.startDate,
        range.endDate,
      );
      return MetricsService.fillMissingMonths(
        rawData,
        range.startDate,
        range.endDate,
      );
    });

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

    const key = metricsKey(workspaceId, "expenses", startDate, endDate);
    const formatted = await getOrSet(key, METRICS_TTL, async () => {
      const rawData = await MetricsRepository.getMonthlyTotalsByType(
        workspaceId,
        "expense",
        range.startDate,
        range.endDate,
      );
      return MetricsService.fillMissingMonths(
        rawData,
        range.startDate,
        range.endDate,
      );
    });

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

    const key = metricsKey(workspaceId, "burn-rate", startDate, endDate);
    const formatted = await getOrSet(key, METRICS_TTL, async () => {
      const rawData = await MetricsRepository.getMonthlyTotalsByType(
        workspaceId,
        "expense",
        range.startDate,
        range.endDate,
      );
      return MetricsService.fillMissingMonths(
        rawData,
        range.startDate,
        range.endDate,
      );
    });

    return buildSuccess(formatted);
  }

  static async invalidateWorkspaceCache(workspaceId: string) {
    await cacheDel(
      metricsKey(workspaceId, "revenue"),
      metricsKey(workspaceId, "expenses"),
      metricsKey(workspaceId, "burn-rate"),
      metricsKey(workspaceId, "breakdown-income"),
      metricsKey(workspaceId, "breakdown-expense"),
    );
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

    const key = metricsKey(
      workspaceId,
      `breakdown-${type}`,
      startDate,
      endDate,
    );
    const formatted = await getOrSet(key, METRICS_TTL, async () => {
      const rawData = await MetricsRepository.getCategoryBreakdown(
        workspaceId,
        type,
        range.startDate,
        range.endDate,
      );
      return rawData.map((row) => ({
        categoryId: row.categoryId,
        name: row.categoryName,
        value: Number(row.total || 0),
      }));
    });

    return buildSuccess(formatted, "Category breakdown retrieved");
  }
}
