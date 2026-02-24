import { t, type Static } from "elysia";

export const ChartDataPointDto = t.Object({
  name: t.String(),
  current: t.Number(),
  previous: t.Optional(t.Number()),
  average: t.Optional(t.Number()),
});

export const MetricsResponseDto = t.Array(ChartDataPointDto);

export type ChartDataPoint = Static<typeof ChartDataPointDto>;
export type MetricsResponse = Static<typeof MetricsResponseDto>;
