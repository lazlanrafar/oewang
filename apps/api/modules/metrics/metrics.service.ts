import { MetricsRepository } from "./metrics.repository";
import { buildSuccess, buildError } from "@workspace/utils";
import { format, subMonths, startOfMonth } from "date-fns";
import type { ChartDataPoint } from "./metrics.dto";

export abstract class MetricsService {
  /**
   * Helper to fill in missing months with zero values
   * so Recharts renders a continuous timeline.
   */
  private static fillMissingMonths(
    dbResults: { month: string; total: number }[],
    monthsAgo = 11,
  ): ChartDataPoint[] {
    const dataMap = new Map<string, number>();
    for (const row of dbResults) {
      // Coerce Decimal string from DB to number
      dataMap.set(row.month, Number(row.total || 0));
    }

    const chartData: ChartDataPoint[] = [];
    const now = new Date();

    // Calculates total to compute average
    let runningTotal = 0;

    for (let i = monthsAgo; i >= 0; i--) {
      const monthDate = startOfMonth(subMonths(now, i));
      const monthLabel = format(monthDate, "MMM ''yy");
      const current = dataMap.get(monthLabel) || 0;

      runningTotal += current;

      chartData.push({
        name: monthLabel,
        current,
      });
    }

    // Append average line
    if (chartData.length > 0) {
      const average = Math.round(runningTotal / chartData.length);
      for (const point of chartData) {
        point.average = average;
      }
    }

    return chartData;
  }

  static async getRevenue(workspaceId: string) {
    const rawData = await MetricsRepository.getMonthlyTotalsByType(
      workspaceId,
      "income",
    );

    const formatted = MetricsService.fillMissingMonths(rawData);

    return buildSuccess(formatted, "Revenue metrics retrieved");
  }

  static async getExpenses(workspaceId: string) {
    const rawData = await MetricsRepository.getMonthlyTotalsByType(
      workspaceId,
      "expense",
    );

    const formatted = MetricsService.fillMissingMonths(rawData);

    return buildSuccess(formatted, "Expenses metrics retrieved");
  }

  static async getBurnRate(workspaceId: string) {
    // For this example, burn rate is defined as monthly expenses.
    // In a real app, it might subtract revenue, or average it differently.
    const rawData = await MetricsRepository.getMonthlyTotalsByType(
      workspaceId,
      "expense",
    );

    const formatted = MetricsService.fillMissingMonths(rawData);

    return buildSuccess(formatted);
  }
}
