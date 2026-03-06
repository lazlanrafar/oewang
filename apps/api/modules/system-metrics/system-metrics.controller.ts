import { Elysia } from "elysia";
import { requireAdminAccess } from "../system-admins/system-admins.controller";
import { SystemMetricsModel } from "./system-metrics.dto";
import { SystemMetricsService } from "./system-metrics.service";

export const systemMetricsController = new Elysia({ prefix: "/system-metrics" })
  .use(requireAdminAccess)
  .get(
    "/",
    async ({ query }) => {
      const response = await SystemMetricsService.getOverview(
        query.start,
        query.end,
      );
      return response;
    },
    {
      query: SystemMetricsModel.query,
      detail: {
        summary: "Get System Overview Metrics",
        tags: ["Admin Metrics"],
      },
    },
  );
