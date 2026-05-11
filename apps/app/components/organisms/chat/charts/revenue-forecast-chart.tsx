"use client";

import { useMemo } from "react";

import { format, parseISO } from "date-fns";
import { Area, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import type { ForecastData, RevenueForecastChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig, createCompactTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

export function RevenueForecastChart({
  data,
  height = 320,
  className = "",
  currency = "USD",
  locale,
  forecastStartIndex,
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
  onSelectionStateChange,
}: RevenueForecastChartProps) {
  // Normalize data - create a range array for confidence band
  const normalizedData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d) => ({
      ...d,
      // Create a range array for the Area component [pessimistic, optimistic]
      confidenceRange: d.optimistic != null && d.pessimistic != null ? [d.pessimistic, d.optimistic] : null,
    }));
  }, [data]);

  // Detect forecast start index dynamically
  const forecastStartIndexFinal = useMemo(() => {
    if (forecastStartIndex !== undefined && forecastStartIndex >= 0) {
      return forecastStartIndex;
    }

    // Find the last month that has both actual and forecasted (forecast start month)
    // or the first month that has forecasted but no actual
    let lastActualIndex = -1;
    for (let i = normalizedData.length - 1; i >= 0; i--) {
      const item = normalizedData[i];
      if (item && item.actual !== null && item.actual !== undefined) {
        lastActualIndex = i;
        break;
      }
    }

    // If the last actual month also has forecasted, that's the forecast start
    const lastActualItem = lastActualIndex >= 0 ? normalizedData[lastActualIndex] : null;
    if (
      lastActualItem &&
      lastActualItem.forecasted !== null &&
      lastActualItem.forecasted !== undefined
    ) {
      return lastActualIndex;
    }

    // Otherwise, find the first month with forecasted but no actual
    const startIndex = normalizedData.findIndex(
      (d) => (d.actual === null || d.actual === undefined) && d.forecasted !== null && d.forecasted !== undefined,
    );

    return startIndex >= 0 ? startIndex : null;
  }, [normalizedData, forecastStartIndex]);

  // Get forecast start month for tooltip and ReferenceLine
  const forecastStartMonth =
    forecastStartIndexFinal !== null && forecastStartIndexFinal !== undefined && normalizedData[forecastStartIndexFinal]
      ? normalizedData[forecastStartIndexFinal].month
      : null;

  // Use compact tick formatter (same as other charts)
  const tickFormatter = createCompactTickFormatter();

  // Calculate margin using the utility hook
  // Use the maximum value from actual or forecasted for margin calculation
  const marginData = normalizedData.map((d) => ({
    value: Math.max(d.actual ?? 0, d.forecasted ?? 0),
  }));
  const { marginLeft } = useChartMargin(marginData, "value", tickFormatter);

  // Calculate dynamic domain based on data (including confidence bands)
  const yAxisDomain = useMemo(() => {
    const allValues = normalizedData
      .flatMap((d) => [d.actual ?? 0, d.forecasted ?? 0, d.optimistic ?? 0, d.pessimistic ?? 0])
      .filter((v) => v > 0);

    if (allValues.length === 0) return { min: 0, max: 10000 };

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);

    // Add 10% padding
    const padding = (max - min) * 0.1;
    const minWithPadding = Math.max(0, min - padding);
    const maxWithPadding = max + padding;

    return { min: minWithPadding, max: maxWithPadding };
  }, [normalizedData]);

  // Check if we have confidence band data
  const hasConfidenceBand = useMemo(() => {
    return normalizedData.some((d) => d.confidenceRange != null);
  }, [normalizedData]);

  const chartContent = (
    <BaseChart data={normalizedData} height={height} margin={{ top: 20, right: 6, left: -marginLeft, bottom: 6 }}>
      <XAxis
        dataKey="month"
        axisLine={false}
        tickLine={false}
        tick={{
          fill: "var(--chart-axis-text)",
          fontSize: 10,
          fontFamily: commonChartConfig.fontFamily,
        }}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{
          fill: "var(--chart-axis-text)",
          fontSize: 10,
          fontFamily: commonChartConfig.fontFamily,
        }}
        tickFormatter={tickFormatter}
        domain={[yAxisDomain.min, yAxisDomain.max]}
      />
      {forecastStartIndexFinal !== null &&
        forecastStartIndexFinal !== undefined &&
        forecastStartIndexFinal >= 0 && (
          <ReferenceLine
            x={forecastStartIndexFinal}
            stroke="var(--chart-reference-line-stroke)"
            strokeWidth={1}
            label={{
              value: "Forecast Start",
              position: "top",
              fill: "var(--chart-reference-label)",
              style: {
                fontSize: "10px",
                fill: "var(--chart-reference-label)",
                textAnchor: "start",
              },
            }}
          />
        )}
      {/* Confidence band (shaded area between pessimistic and optimistic) */}
      {hasConfidenceBand && (
        <Area
          type="monotone"
          dataKey="confidenceRange"
          fill="var(--chart-forecast-line)"
          fillOpacity={0.1}
          stroke="none"
          isAnimationActive={false}
          connectNulls={false}
        />
      )}
      <Tooltip
        content={
          <StyledTooltip
            formatter={(value: number | string, name: string, entry: any) => {
              const data = entry.payload as ForecastData;
              const numValue = typeof value === "number" ? value : Number(value);
              const formattedValue =
                formatAmount({
                  amount: numValue,
                  currency,
                  locale,
                  maximumFractionDigits: 0,
                }) ?? `${currency}${numValue.toLocaleString()}`;

              // Determine display name
              let displayName = name.charAt(0).toUpperCase() + name.slice(1);
              if (data.month === forecastStartMonth) {
                displayName = name === "actual" ? "Actual (Baseline)" : "Forecast Start";
              }

              return [formattedValue, displayName];
            }}
            extraContent={(payload) => {
              if (!payload || payload.length === 0) return null;
              const data = payload[0].payload as ForecastData;
              const isActual = data.actual != null;

              const formatCurrency = (amount: number) =>
                formatAmount({
                  amount,
                  currency,
                  locale,
                  maximumFractionDigits: 0,
                }) ?? `${currency}${amount.toLocaleString()}`;

              return (
                <>
                  {!isActual && data.optimistic != null && data.pessimistic != null && (
                    <div className="mt-1.5 border-[#e6e6e6] border-t pt-1.5 dark:border-[#1d1d1d]">
                      <p className="text-[#707070] text-[9px] dark:text-[#666666]">
                        Range: {formatCurrency(data.pessimistic)} - {formatCurrency(data.optimistic)}
                      </p>
                      {data.confidence != null && (
                        <p className="text-[#707070] text-[9px] dark:text-[#666666]">Confidence: {data.confidence}%</p>
                      )}
                    </div>
                  )}

                  {!isActual && data.breakdown && (
                    <div className="mt-1.5 border-[#e6e6e6] border-t pt-1.5 dark:border-[#1d1d1d]">
                      <p className="mb-0.5 text-[#888] text-[9px] uppercase tracking-wider dark:text-[#555]">Sources</p>
                      {Object.entries(data.breakdown)
                        .filter(([_, val]) => typeof val === "number" && val > 0)
                        .map(([key, val]) => (
                          <p key={key} className="text-[#707070] text-[9px] dark:text-[#666666]">
                            {key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())}:{" "}
                            {formatCurrency(val as number)}
                          </p>
                        ))}
                    </div>
                  )}
                </>
              );
            }}
          />
        }
        wrapperStyle={{ zIndex: 9999 }}
        cursor={{
          stroke: "var(--chart-tooltip-cursor)",
          strokeWidth: 1,
        }}
        isAnimationActive={false}
      />
      <Line
        type="monotone"
        dataKey="actual"
        stroke="var(--chart-actual-line)"
        strokeWidth={2}
        dot={{
          fill: "var(--chart-actual-line)",
          strokeWidth: 0,
          r: 4,
        }}
        activeDot={{
          r: 5,
          stroke: "var(--chart-actual-line)",
          strokeWidth: 2,
          fill: "var(--chart-actual-line)",
        }}
        isAnimationActive={false}
        connectNulls={false}
      />
      <Line
        type="monotone"
        dataKey="forecasted"
        stroke="var(--chart-forecast-line)"
        strokeWidth={2}
        strokeDasharray="8 4"
        dot={{
          fill: "var(--chart-forecast-line)",
          strokeWidth: 0,
          r: 4,
        }}
        activeDot={{
          r: 5,
          stroke: "var(--chart-forecast-line)",
          strokeWidth: 2,
          fill: "var(--chart-forecast-line)",
        }}
        isAnimationActive={false}
        connectNulls={true}
      />
    </BaseChart>
  );

  return (
    <SelectableChartWrapper
      data={normalizedData}
      dateKey="month"
      enableSelection={enableSelection}
      onSelectionChange={onSelectionChange}
      onSelectionComplete={(startDate, endDate) => {
        onSelectionComplete?.(startDate, endDate, "revenue-forecast");
      }}
      onSelectionStateChange={onSelectionStateChange}
      chartType="revenue-forecast"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
