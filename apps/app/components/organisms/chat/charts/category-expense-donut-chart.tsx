"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatAmount } from "./format-amount";

import type { CategoryExpenseData, CategoryExpenseDonutChartProps } from "@workspace/types";
import { StyledTooltip } from "./base-charts";

// Gray shades for categories (always use these, ignore color from data)
export const grayShades = [
  "hsl(var(--foreground))", // Foreground color - adapts to light/dark mode
  "#707070", // Gray for second
  "#A0A0A0", // Light gray for third
  "#606060", // Dark gray for fourth
  "#404040", // Darker gray for fifth
  "#303030", // Even darker gray for sixth
  "#202020", // Very dark gray for seventh
];

export function CategoryExpenseDonutChart({
  data,
  currency = "USD",
  locale,
  height = 320,
  className = "",
}: CategoryExpenseDonutChartProps) {
  // Transform data for the chart - always use gray shades, ignore color from data
  const chartData = data.map((item, index) => ({
    ...item,
    name: item.category,
    value: item.amount,
    color: grayShades[index % grayShades.length],
  }));

  return (
    <div className={`w-full ${className}`}>
      <div className="relative" style={{ height }}>
        {/* Dotted background */}
        <div
          className="absolute inset-0 dark:hidden"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.03) 1px, transparent 1px)",
            backgroundSize: "12px 12px",
          }}
        />
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "12px 12px",
          }}
        />
        <ResponsiveContainer width="100%" height="100%" debounce={1} className="relative">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={80} // Inner radius creates the hole
              outerRadius={120}
              fill="hsl(var(--foreground))"
              dataKey="value"
              paddingAngle={1}
              stroke="none"
              isAnimationActive={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${entry.category}-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              content={
                <StyledTooltip
                  formatter={(value: number | string, name: string, entry: any) => {
                    const data = entry.payload as CategoryExpenseData;
                    const numValue = typeof value === "number" ? value : Number(value);
                    const formattedValue =
                      formatAmount({
                        amount: numValue,
                        currency,
                        locale,
                      }) || `${currency}${numValue.toLocaleString()}`;
                    return [formattedValue, data.category];
                  }}
                  extraContent={(payload) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0].payload as CategoryExpenseData;
                    return <p className="text-[#707070] dark:text-[#666666]">{data.percentage.toFixed(1)}%</p>;
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
