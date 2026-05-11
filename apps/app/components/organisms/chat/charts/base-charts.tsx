"use client";

import type * as React from "react";

import * as RechartsPrimitive from "recharts";

import { commonChartConfig } from "./chart-utils";

// Base Chart Wrapper with common styling
export function BaseChart<T extends object>({
  data,
  height = 320,
  margin = { top: 6, right: 6, left: -20, bottom: 6 },
  children,
}: {
  data: T[];
  height?: number;
  margin?: { top: number; right: number; left: number; bottom: number };
  children: React.ReactNode;
  config?: Record<string, unknown>;
}) {
  return (
    <div style={{ height }}>
      <RechartsPrimitive.ResponsiveContainer width="100%" height="100%" debounce={1}>
        <RechartsPrimitive.ComposedChart data={data} margin={margin}>
          <defs>
            {/* Standard Income/Revenue Pattern */}
            <pattern id="incomePattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="var(--chart-pattern-bg)" />
              <path
                d="M0,0 L8,8 M-2,6 L6,14 M-4,4 L4,12 M6,-2 L14,6 M4,-4 L12,4"
                stroke="var(--chart-pattern-stroke)"
                strokeWidth="1"
                opacity="0.6"
              />
            </pattern>

            {/* Standard Expense/Outflow Pattern */}
            <pattern id="expensePattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="var(--chart-pattern-bg)" />
              <path
                d="M0,0 L8,8 M-2,6 L6,14 M-4,4 L4,12 M6,-2 L14,6 M4,-4 L12,4"
                stroke="var(--chart-pattern-stroke)"
                strokeWidth="1"
                opacity="0.4"
              />
            </pattern>

            {/* Legacy patterns for compatibility (aliased to income/expense) */}
            <pattern id="chartAreaPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="var(--chart-pattern-bg)" />
              <path
                d="M0,0 L8,8 M-2,6 L6,14 M-4,4 L4,12 M6,-2 L14,6 M4,-4 L12,4"
                stroke="var(--chart-pattern-stroke)"
                strokeWidth="1"
                opacity="0.6"
              />
            </pattern>
            <pattern id="chartBarPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="var(--chart-pattern-bg)" />
              <path
                d="M0,0 L8,8 M-2,6 L6,14 M-4,4 L4,12 M6,-2 L14,6 M4,-4 L12,4"
                stroke="var(--chart-pattern-stroke)"
                strokeWidth="1"
                opacity="0.35"
              />
            </pattern>
            <pattern id="outflowPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="var(--chart-pattern-bg)" />
              <path
                d="M0,0 L8,8 M-2,6 L6,14 M-4,4 L4,12 M6,-2 L14,6 M4,-4 L12,4"
                stroke="var(--chart-pattern-stroke)"
                strokeWidth="1"
                opacity="0.6"
              />
            </pattern>
            <pattern id="chartAreaGradient" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="var(--chart-pattern-bg)" />
              <path
                d="M0,0 L8,8 M-2,6 L6,14 M-4,4 L4,12 M6,-2 L14,6 M4,-4 L12,4"
                stroke="var(--chart-pattern-stroke)"
                strokeWidth="1"
                opacity="0.6"
              />
            </pattern>
          </defs>
          <RechartsPrimitive.CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" />
          {children}
        </RechartsPrimitive.ComposedChart>
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  );
}

// Styled Tooltip
export function StyledTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  extraContent,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  formatter?: (value: number | string, name: string, entry: any) => [string, string];
  labelFormatter?: (label: any) => string;
  extraContent?: (payload: any[]) => React.ReactNode;
}) {
  if (active && payload && payload.length) {
    const displayLabel = labelFormatter ? labelFormatter(label) : label;
    return (
      <div
        className="border border-gray-200 bg-white p-2 font-sans text-[10px] text-black dark:border-[#1d1d1d] dark:bg-[#0c0c0c] dark:text-white"
        style={{
          borderRadius: "0px",
          fontFamily: commonChartConfig.fontFamily,
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
        }}
      >
        <p className="mb-1 text-gray-500 dark:text-[#666666]">{displayLabel}</p>
        {payload.map((entry, index) => {
          const value = typeof entry.value === "number" ? entry.value : 0;
          const dataKeyStr = String(entry.dataKey ?? "");
          const [formattedValue, name] = formatter
            ? formatter(value, dataKeyStr, entry)
            : [`${value.toLocaleString()}`, dataKeyStr];

          return (
            <p key={`${dataKeyStr}-${index}`} className="text-black dark:text-white">
              {name}: {formattedValue}
            </p>
          );
        })}
        {extraContent && extraContent(payload)}
      </div>
    );
  }

  return null;
}

// Chart Legend
export function ChartLegend({
  title,
  items,
}: {
  title?: string;
  items: {
    label: string;
    type: "solid" | "dashed" | "pattern";
    color?: string;
  }[];
}) {
  return (
    <div
      className={`flex items-center ${title ? "justify-between" : "justify-end"} mb-4`}
    >
      {title && (
        <h4 className="font-normal font-serif text-[18px] text-black dark:text-white">
          {title}
        </h4>
      )}
      <div className="flex items-center gap-4">
        {items.map((item, index) => (
          <div
            key={`legend-${item.label}-${index}`}
            className="flex items-center gap-2"
          >
            <div
              className="h-2 w-2"
              style={{
                background:
                  item.type === "solid"
                    ? item.color || "#000000"
                    : item.type === "pattern"
                      ? "repeating-linear-gradient(45deg, #666666, #666666 1px, transparent 1px, transparent 2px)"
                      : item.color || "#666666",
                borderRadius: "0",
              }}
            />
            <span className="text-[12px] text-gray-500 dark:text-[#666666]">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
