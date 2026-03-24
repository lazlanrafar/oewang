import { artifact } from "@ai-sdk-tools/artifacts";
import { z } from "zod";

export const spendingArtifact: any = artifact(
  "spending-canvas",
  z.object({
    stage: z.enum(["loading", "chart_ready", "metrics_ready", "analysis_ready"]),
    currency: z.string(),
    metrics: z
      .object({
        totalSpending: z.number(),
      })
      .optional(),
    analysis: z
      .object({
        summary: z.string(),
      })
      .optional(),
  }) as any,
);

export const burnRateArtifact: any = artifact(
  "burn-rate-canvas",
  z.object({
    stage: z.enum(["loading", "chart_ready", "metrics_ready", "analysis_ready"]),
    metrics: z
      .object({
        monthlyBurn: z.number(),
        runwayMonths: z.number(),
      })
      .optional(),
  }) as any,
);
