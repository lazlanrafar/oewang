"use client";

import {
  BaseCanvas,
  CanvasHeader,
  CanvasContent,
  CanvasChart,
  CanvasGrid,
  CanvasSection,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
} from "@workspace/ui";
import { useAppStore } from "../../../../stores/app";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";
import { BurnRateChart } from "../charts/burn-rate-chart";
import { formatAmount } from "../charts/format-amount";

export function BurnRateCanvas() {
  const data = useStaticArtifactData("burn-rate-canvas");
  const user = useAppStore((state) => state.user) as any;
  const locale = user?.locale || "en-US";
  const currency = data?.currency || "USD";
  const stage = data?.stage;

  // Map the oewang chart data format to what BurnRateChart expects
  const burnRateData =
    data?.chart?.map((item: any) => ({
      month: item.label,
      amount: item.value,
      average: data.metrics?.avgMonthlyBurn || 0,
      currentBurn: item.value,
      averageBurn: data.metrics?.avgMonthlyBurn || 0,
    })) || [];

  const burnMetrics = data?.metrics
    ? [
        {
          id: "avg-burn",
          title: "Avg Monthly Burn",
          value: formatAmount({
            amount: data.metrics.avgMonthlyBurn || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: "Based on last 6 months",
        },
        {
          id: "runway",
          title: "Estimated Runway",
          value: data.metrics.runway || "—",
          subtitle: "At current burn rate",
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
              title="Monthly Burn Rate"
              legend={{
                items: [
                  { label: "Current", type: "solid" },
                  { label: "Average", type: "pattern" },
                ],
              }}
              isLoading={stage === "loading"}
              height="20rem"
            >
              <BurnRateChart
                data={burnRateData}
                height={320}
                showLegend={false}
                currency={currency}
                locale={locale}
              />
            </CanvasChart>
          )}

          {/* Metric cards */}
          <CanvasGrid
            items={burnMetrics}
            layout="2/2"
            isLoading={shouldShowMetricsSkeleton(stage)}
          />

          {/* Summary */}
          <CanvasSection title="Summary" isLoading={shouldShowSummarySkeleton(stage)}>
            {data?.analysis?.summary}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
