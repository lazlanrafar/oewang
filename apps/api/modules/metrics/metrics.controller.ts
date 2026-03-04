import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { MetricsService } from "./metrics.service";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const metricsController = new Elysia({ prefix: "/metrics" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
  }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .get(
    "/revenue",
    async ({ workspaceId }) => {
      const response = await MetricsService.getRevenue(workspaceId!);
      return response;
    },
    {
      detail: { summary: "Get Revenue", tags: ["Metrics"] },
    },
  )
  .get(
    "/expenses",
    async ({ workspaceId }) => {
      const response = await MetricsService.getExpenses(workspaceId!);
      return response;
    },
    {
      detail: { summary: "Get Expenses", tags: ["Metrics"] },
    },
  )
  .get(
    "/burn-rate",
    async ({ workspaceId }) => {
      const response = await MetricsService.getBurnRate(workspaceId!);
      return response;
    },
    {
      detail: { summary: "Get Burn Rate", tags: ["Metrics"] },
    },
  )
  .get(
    "/category-breakdown",
    async ({ workspaceId, query }) => {
      const type = query?.type === "income" ? "income" : "expense";
      const response = await MetricsService.getCategoryBreakdown(
        workspaceId!,
        type,
      );
      return response;
    },
    {
      detail: { summary: "Get Category Breakdown", tags: ["Metrics"] },
    },
  );
