"use client";

import {
  BaseCanvas,
  CanvasHeader,
  CanvasContent,
  CanvasChart,
  CanvasGrid,
  CanvasSection,
  shouldShowChart,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
} from "@workspace/ui";
import { useAppStore } from "../../../../stores/app";
import { ArtifactTabs, useStaticArtifactData } from "./chat-canvas";
import { RevenueTrendChart } from "../charts/revenue-trend-chart";
import { formatAmount } from "../charts/format-amount";

export function RevenueCanvas() {
  const data = useStaticArtifactData("revenue-canvas");
  const user = useAppStore((state) => state.user) as any;
  const locale = user?.locale || "en-US";
  const stage = data?.stage;
  const currency = data?.currency || "USD";

  // Map monthly data if available (Okane may return flat metrics, not chart data)
  const revenueData =
    data?.chart?.monthlyData?.map((item: any) => ({
      month: item.month,
      revenue: item.revenue,
      lastYearRevenue: item.lastYearRevenue,
      average: item.average,
    })) || [];

  const revenueMetrics = data?.metrics
    ? [
        {
          id: "total-revenue",
          title: "Total Revenue",
          value: formatAmount({
            amount: data.metrics.totalRevenue || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: "All periods combined",
        },
        {
          id: "average-monthly-revenue",
          title: "Avg Monthly Revenue",
          value: formatAmount({
            amount: data.metrics.averageMonthlyRevenue || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: "Over last 12 months",
        },
        {
          id: "current-month-revenue",
          title: "Current Month",
          value: formatAmount({
            amount: data.metrics.currentMonthRevenue || 0,
            currency,
            locale,
            maximumFractionDigits: 0,
          }),
          subtitle: "Latest period",
        },
        {
          id: "revenue-growth",
          title: "Revenue Growth",
          value: `${data.metrics.revenueGrowth || 0}%`,
          subtitle: "Year-over-year",
        },
      ]
    : [];

  const showChart = shouldShowChart(stage) && revenueData.length > 0;

  return (
    <BaseCanvas>
      <CanvasHeader tabs={<ArtifactTabs />} />

      <CanvasContent>
        <div className="space-y-8 pb-20">
          {/* Revenue Trend Chart */}
          {showChart && (
            <CanvasChart
              title="Monthly Revenue Trend"
              legend={{
                items: [
                  { label: "This Year", type: "solid" },
                  { label: "Last Year", type: "solid" },
                  { label: "Average", type: "pattern" },
                ],
              }}
              isLoading={!data || !stage}
              height="20rem"
            >
              <RevenueTrendChart
                data={revenueData}
                height={320}
                showLegend={false}
                currency={currency}
                locale={locale}
              />
            </CanvasChart>
          )}

          {/* Revenue grid metrics */}
          <CanvasGrid
            items={revenueMetrics}
            layout="2/2"
            isLoading={shouldShowMetricsSkeleton(stage)}
          />

          {/* Summary */}
          <CanvasSection
            title="Summary"
            isLoading={shouldShowSummarySkeleton(stage)}
          >
            {data?.analysis?.summary}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
