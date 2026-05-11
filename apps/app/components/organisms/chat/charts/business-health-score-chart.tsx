"use client";

import { Line, Tooltip, XAxis, YAxis } from "recharts";

import type { BusinessHealthScoreChartProps } from "@workspace/types";
import { BaseChart, StyledTooltip } from "./base-charts";
import { commonChartConfig } from "./chart-utils";

export function BusinessHealthScoreChart({ data, height = 320 }: BusinessHealthScoreChartProps) {
  // Simple tick formatter for 0-100 scores
  const tickFormatter = (value: number) => `${value}`;

  const marginLeft = 34;

  return (
    <div className="w-full">
      {/* Chart */}
      <BaseChart data={data} height={height} margin={{ top: 6, right: 6, left: -marginLeft, bottom: 6 }}>
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
          domain={[0, 100]}
        />
        <Tooltip
          content={
            <StyledTooltip
              formatter={(value: number | string) => {
                const numValue = typeof value === "number" ? value : Number(value);
                return [`${numValue.toFixed(1)}/100`, "Health Score"];
              }}
            />
          }
          wrapperStyle={{ zIndex: 9999 }}
        />
        <Line
          type="monotone"
          dataKey="healthScore"
          stroke="var(--chart-line-secondary)"
          strokeWidth={2}
          dot={{
            fill: "var(--chart-actual-line)",
            strokeWidth: 0,
            r: 3,
          }}
          activeDot={{
            r: 5,
            fill: "var(--chart-actual-line)",
            stroke: "var(--chart-actual-line)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </BaseChart>
    </div>
  );
}
