import { t } from "elysia";

export const SystemMetricsModel = {
  query: t.Object({
    start: t.Optional(t.String()),
    end: t.Optional(t.String()),
  }),
} as const;
