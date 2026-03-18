"use client";

import {
  BaseCanvas,
  CanvasChart,
  CanvasGrid,
  CanvasHeader,
  CanvasSection,
  CanvasContent,
  formatCurrencyAmount,
  shouldShowChart,
  shouldShowMetricsSkeleton,
  shouldShowSummarySkeleton,
} from "@workspace/ui";
const useUserQuery = () => ({ data: { locale: "en-US" } });
const revenueArtifact: any = {};
const RevenueTrendChart = (props: any) => <div />;
const useQueryState = (key: string, def: any) => [0];
const parseAsInteger = { withDefault: (d: any) => d };
const useArtifact = (art: any, opts: any): [any] => [{ data: { stage: "complete", currency: "USD", metrics: {}, chart: { monthlyData: [] }, analysis: { summary: "" } }, status: "success" }];

export function RevenueCanvas() {
  const [version] = useQueryState("version", parseAsInteger.withDefault(0));
  const [artifact] = useArtifact(revenueArtifact, { version });
  const { data, status } = artifact;
  const { data: user } = useUserQuery();
  const stage = data?.stage;
  const currency = data?.currency || "USD";
  const locale = user?.locale ?? undefined;

  // Use artifact data or fallback to empty/default values
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
          value: formatCurrencyAmount(
            data.metrics.totalRevenue || 0,
            currency,
            locale,
          ),
          subtitle: "All periods combined",
        },
        {
          id: "average-monthly-revenue",
          title: "Average Monthly Revenue",
          value: formatCurrencyAmount(
            data.metrics.averageMonthlyRevenue || 0,
            currency,
            locale,
          ),
          subtitle: "Over last 12 months",
        },
        {
          id: "current-month-revenue",
          title: "Current Month Revenue",
          value: formatCurrencyAmount(
            data.metrics.currentMonthRevenue || 0,
            currency,
            locale,
          ),
          subtitle: "Latest month",
        },
        {
          id: "revenue-growth",
          title: "Revenue Growth",
          value: `${data.metrics.revenueGrowth || 0}%`,
          subtitle: "Year-over-year increase",
        },
      ]
    : [];

  const showChart = shouldShowChart(stage);
  const showSummarySkeleton = shouldShowSummarySkeleton(stage);

  return (
    <BaseCanvas>
      <CanvasHeader title="Revenue Analysis" />

      <CanvasContent>
        <div className="space-y-8">
          {/* Show chart as soon as we have revenue data */}
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
              isLoading={stage === ("loading" as any)}
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

          {/* Always show metrics section */}
          <CanvasGrid
            items={revenueMetrics}
            layout="2/2"
            isLoading={shouldShowMetricsSkeleton(stage)}
          />

          {/* Always show summary section */}
          <CanvasSection title="Summary" isLoading={showSummarySkeleton}>
            {data?.analysis?.summary}
          </CanvasSection>
        </div>
      </CanvasContent>
    </BaseCanvas>
  );
}
