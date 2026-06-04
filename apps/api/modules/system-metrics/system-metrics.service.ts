import { buildSuccess } from "@workspace/utils";
import { cacheGet, cacheSet } from "../../lib/cache";
import { SystemMetricsRepository } from "./system-metrics.repository";

const SYSTEM_METRICS_TTL = 60 * 15; // 15 min — admin overview, tolerates slight staleness
const systemMetricsKey = (start?: string, end?: string) =>
  `oewang:system-metrics:${start ?? "d"}:${end ?? "d"}`;

export abstract class SystemMetricsService {
  static async getOverview(start?: string, end?: string) {
    const key = systemMetricsKey(start, end);
    const cached = await cacheGet<object>(key);
    if (cached) return buildSuccess(cached, "System metrics fetched");

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

    const result = { metrics, chartData: timeSeries };
    await cacheSet(key, result, SYSTEM_METRICS_TTL);

    return buildSuccess(result, "System metrics fetched");
  }
}
