"use client";

import {
  Bar,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CategoryData, ExpensesChartProps } from "@workspace/types";
import { BaseChart, ChartLegend, StyledTooltip } from "./base-charts";
import { createYAxisTickFormatter, useChartMargin } from "./chart-utils";
import { formatAmount } from "./format-amount";
import { SelectableChartWrapper } from "./selectable-chart-wrapper";

function PatternBarShape(props: any) {
  const { x, y, width, height, radius } = props;

  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const topRadius = Array.isArray(radius) ? (radius[0] ?? 0) : (radius ?? 0);

  return (
    <g>
      <path
        d={`
          M ${x},${y + height}
          L ${x},${y + topRadius}
          Q ${x},${y} ${x + topRadius},${y}
          L ${x + width - topRadius},${y}
          Q ${x + width},${y} ${x + width},${y + topRadius}
          L ${x + width},${y + height}
          Z
        `}
        fill="hsl(var(--muted) / 0.5)"
      />
      <path
        d={`
          M ${x},${y + height}
          L ${x},${y + topRadius}
          Q ${x},${y} ${x + topRadius},${y}
          L ${x + width - topRadius},${y}
          Q ${x + width},${y} ${x + width},${y + topRadius}
          L ${x + width},${y + height}
          Z
        `}
        fill="url(#expensePattern)"
      />
      <path
        d={`
          M ${x},${y + height}
          L ${x},${y + topRadius}
          Q ${x},${y} ${x + topRadius},${y}
          L ${x + width - topRadius},${y}
          Q ${x + width},${y} ${x + width},${y + topRadius}
          L ${x + width},${y + height}
          Z
        `}
        fill="none"
        stroke="var(--chart-actual-line)"
        strokeWidth="1"
      />
    </g>
  );
}

export function ExpensesChart({
  data,
  categoryData,
  height = 320,
  className = "",
  chartType = "bar",
  showLegend = true,
  currency = "USD",
  locale,
  valueLabel = "Expenses",
  title = "Monthly Expenses",
  enableSelection = false,
  onSelectionChange,
  onSelectionComplete,
  onSelectionStateChange,
}: ExpensesChartProps) {
  const tickFormatter = createYAxisTickFormatter(currency, locale);
  const maxValues = data.map((d) => ({ maxValue: d.amount }));
  const { marginLeft } = useChartMargin(maxValues, "maxValue", tickFormatter);

  if (chartType === "pie" && categoryData) {
    return (
      <div className={`w-full ${className}`}>
        {/* Legend */}
        {showLegend && (
          <ChartLegend
            title="Expenses by Category"
            items={categoryData.map((item) => ({
              label: item.name,
              type: "solid" as const,
              color: item.color,
            }))}
          />
        )}

        {/* Pie Chart */}
        <div className="relative" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%" debounce={1}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                outerRadius={height / 2 - 20}
                fill="hsl(var(--foreground))"
                dataKey="value"
                isAnimationActive={false}
              >
                {categoryData.map((entry, index) => (
                  <Cell
                    key={`cell-${entry.name}-${index}`}
                    fill={entry.color}
                    stroke="none"
                  />
                ))}
              </Pie>
              <Tooltip
                content={
                  <StyledTooltip
                    formatter={(
                      value: number | string,
                      _: string,
                      entry: any,
                    ) => {
                      const data = entry.payload as CategoryData;
                      const numValue =
                        typeof value === "number" ? value : Number(value);
                      const formattedValue =
                        formatAmount({
                          amount: numValue,
                          currency,
                          locale,
                          maximumFractionDigits: 0,
                        }) || `${currency}${numValue.toLocaleString()}`;
                      return [formattedValue, data.name];
                    }}
                  />
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  const chartContent = (
    <div className={`w-full ${className}`}>
      {/* Legend */}
      {showLegend && (
        <ChartLegend
          title={title}
          items={[{ label: valueLabel, type: "solid" }]}
        />
      )}

      {/* Bar Chart */}
      <BaseChart
        data={data}
        height={height}
        margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}
      >
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--chart-axis-text)", fontSize: 10 }}
        />
        <YAxis
          tickFormatter={tickFormatter}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "var(--chart-axis-text)", fontSize: 10 }}
        />

        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string, name: string) => {
                const numValue =
                  typeof value === "number" ? value : Number(value);
                const formattedValue =
                  formatAmount({
                    amount: numValue,
                    currency,
                    locale,
                    maximumFractionDigits: 0,
                  }) || `${currency}${numValue.toLocaleString()}`;
                const displayName = name === "amount" ? valueLabel : name;
                return [formattedValue, displayName];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />

        <Bar
          dataKey="amount"
          radius={[2, 2, 0, 0]}
          shape={<PatternBarShape />}
          isAnimationActive={false}
        />
      </BaseChart>
    </div>
  );

  // Pie charts don't support selection
  if (chartType === "pie") {
    return chartContent;
  }

  return (
    <SelectableChartWrapper
      data={data}
      dateKey="month"
      enableSelection={enableSelection}
      onSelectionChange={onSelectionChange}
      onSelectionComplete={(startDate, endDate) => {
        onSelectionComplete?.(startDate, endDate, "expenses");
      }}
      onSelectionStateChange={onSelectionStateChange}
      chartType="expenses"
    >
      {chartContent}
    </SelectableChartWrapper>
  );
}
