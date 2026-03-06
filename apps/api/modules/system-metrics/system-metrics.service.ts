import { buildSuccess } from "@workspace/utils";
import { SystemMetricsRepository } from "./system-metrics.repository";

export abstract class SystemMetricsService {
  static async getOverview(start?: string, end?: string) {
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (start) {
      startDate = new Date(start);
      startDate.setHours(0, 0, 0, 0);
    }
    if (end) {
      endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
    }

    const metrics = await SystemMetricsRepository.getOverviewMetrics(
      startDate,
      endDate,
    );

    const timeSeries = await SystemMetricsRepository.getRevenueTimeSeries(
      startDate,
      endDate,
    );

    return buildSuccess(
      {
        metrics,
        chartData: timeSeries,
      },
      "System metrics fetched",
    );
  }
}
