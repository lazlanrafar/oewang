"use client";

import {
  BaseCanvas,
  CanvasChart,
  CanvasContent,
  CanvasGrid,
  CanvasHeader,
  CanvasSection,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
} from "@workspace/ui";

import { useAppStore } from "@/stores/app";
import { getDictionaryText } from "../chat-i18n";
import { BurnRateChart } from "../charts/burn-rate-chart";
import { formatAmount } from "../charts/format-amount";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";

export function BurnRateCanvas({ dataOverride }: { dataOverride?: Record<string, unknown> | null } = {}) {
  const data = (dataOverride ?? (useStaticArtifactData("burn-rate-canvas") as Record<string, unknown> | null) ?? {});
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string) => getDictionaryText(dictionary, key, fallback);
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const currency = (data.currency as string) || "USD";
  const stage = data.stage as string | undefined;
  const chartData = Array.isArray(data.chart) ? (data.chart as Record<string, unknown>[]) : [];
  const metrics = (data.metrics as Record<string, unknown> | undefined) ?? {};
  const analysis = (data.analysis as Record<string, unknown> | undefined) ?? {};

  // Map the oewang chart data format to what BurnRateChart expects
  const burnRateData = chartData.map((item) => {
    const amount = Number(item.value) || 0;
    return {
      month: String(item.label ?? ""),
      amount,
      average: Number(metrics.avgMonthlyBurn) || 0,
      currentBurn: amount,
      averageBurn: Number(metrics.avgMonthlyBurn) || 0,
    };
  });

  const burnMetrics = Object.keys(metrics).length
    ? [
        {
          id: "avg-burn",
          title: t("chat.canvas.burn_rate.avg_monthly_burn", "Avg Monthly Burn"),
          value: formatAmount({
            amount: Number(metrics.avgMonthlyBurn) || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: t("chat.canvas.burn_rate.based_last_6_months", "Based on last 6 months"),
        },
        {
          id: "runway",
          title: t("chat.canvas.burn_rate.estimated_runway", "Estimated Runway"),
          value: String(metrics.runway ?? "—"),
          subtitle: t("chat.canvas.burn_rate.at_current_burn_rate", "At current burn rate"),
        },
      ]
    : [];

  const showChart = stage && ["metrics_ready", "analysis_ready"].includes(stage);

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          {/* Monthly Burn Rate Chart */}
          {showChart && burnRateData.length > 0 && (
            <CanvasChart
              title={t("chat.canvas.burn_rate.monthly_burn_rate", "Monthly Burn Rate")}
              legend={{
                items: [
                  { label: t("chat.canvas.common.current", "Current"), type: "solid" },
                  { label: t("chat.canvas.common.average", "Average"), type: "pattern" },
                ],
              }}
              isLoading={stage === "loading"}
              height="20rem"
            >
              <BurnRateChart data={burnRateData} height={320} showLegend={false} currency={currency} locale={locale} />
            </CanvasChart>
          )}

          {/* Metric cards */}
          <CanvasGrid items={burnMetrics} layout="2/2" isLoading={shouldShowMetricsSkeleton(stage)} />

          {/* Summary */}
          <CanvasSection title={t("chat.canvas.common.summary", "Summary")} isLoading={shouldShowSummarySkeleton(stage)}>
            {String(analysis.summary ?? "")}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
