"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Card, CardContent } from "../atoms/card";

export interface StatCardProps {
  /** The metric label e.g. "Total Revenue" */
  title: string;
  /** The formatted value string e.g. "$12,345" */
  value: string;
  /** Optional previous-period comparison value for trend calculation */
  previousValue?: number;
  /** Current raw numeric value for trend calculation */
  currentValue?: number;
  /** Optional descriptive subtitle shown below the value */
  description?: string;
  /** Optional icon rendered in the top-right corner */
  icon?: React.ReactNode;
  /** Extra className applied to the card root */
  className?: string;
}

/**
 * ## StatCard
 *
 * A simple metric card showing a formatted value with an optional period-over-period
 * trend indicator. Part of the design system's **Atoms** tier.
 *
 * ### Example
 * ```tsx
 * <StatCard
 *   title="Net Revenue"
 *   value={formatCurrency(netRevenue, settings)}
 *   currentValue={netRevenue}
 *   previousValue={prevRevenue}
 *   description="vs. last month"
 * />
 * ```
 */
export function StatCard({
  title,
  value,
  previousValue,
  currentValue,
  description,
  icon,
  className,
}: StatCardProps) {
  const trend = React.useMemo(() => {
    if (previousValue == null || currentValue == null || previousValue === 0)
      return null;
    const pct =
      ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    return {
      pct,
      direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    } as const;
  }, [previousValue, currentValue]);

  return (
    <Card
      className={cn(
        "flex flex-col bg-background border-border overflow-hidden",
        className,
      )}
    >
      <CardContent className="pt-5 px-5 pb-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {icon && <span className="text-muted-foreground">{icon}</span>}
        </div>

        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>

        {trend && (
          <div
            className={cn(
              "mt-2 flex items-center gap-1 text-xs font-medium",
              trend.direction === "up" && "text-green-500",
              trend.direction === "down" && "text-red-500",
              trend.direction === "flat" && "text-muted-foreground",
            )}
          >
            {trend.direction === "up" && <TrendingUp className="w-3 h-3" />}
            {trend.direction === "down" && <TrendingDown className="w-3 h-3" />}
            {trend.direction === "flat" && <Minus className="w-3 h-3" />}
            <span>{Math.abs(trend.pct).toFixed(1)}%</span>
            {description && (
              <span className="text-muted-foreground font-normal">
                {description}
              </span>
            )}
          </div>
        )}

        {!trend && description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
