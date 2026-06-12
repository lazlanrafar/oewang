"use client";

import { type ReactNode, useEffect, useState } from "react";
import { animate } from "framer-motion";
import { cn } from "../../../lib/utils";
import { Skeleton } from "../../atoms/skeleton";

function CountUp({
  value,
  duration = 0.8,
  formatter,
}: {
  value: number;
  duration?: number;
  formatter?: (v: number) => string;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controls = animate(count, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => setCount(latest),
    });
    return () => controls.stop();
  }, [value, duration]);

  return <>{formatter ? formatter(count) : Math.round(count)}</>;
}

interface DataTablePageCardProps {
  /** Card label (small uppercase text above the value) */
  label: string;
  /** The value to display. Numbers animate from 0 with a counter. Strings render as-is. */
  value: number | string;
  /** Whether the value is still loading — shows a Skeleton block in place of the value. */
  isLoading?: boolean;
  /** Optional formatter for number values (e.g. formatCurrency). Ignored for string values. */
  formatter?: (v: number) => string;
  /** Optional className for the value text (e.g. color override). */
  valueClassName?: string;
  /** Optional className for the card container. */
  className?: string;
  /** Optional icon/element rendered in the top-right corner. */
  action?: ReactNode;
}

/**
 * Standard summary card for data-table pages.
 *
 * - Numeric values animate from 0 on mount using a counter (framer-motion).
 * - String values render immediately.
 * - When `isLoading`, only the value block is replaced by a Skeleton — the label stays visible.
 */
export function DataTablePageCard({
  label,
  value,
  isLoading,
  formatter,
  valueClassName,
  className,
  action,
}: DataTablePageCardProps) {
  return (
    <div className={cn("flex flex-col gap-1 border border-border p-6", className)}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
          {label}
        </span>
        {action}
      </div>
      <span className={cn("mt-1 font-medium font-serif text-3xl tracking-tight", valueClassName)}>
        {isLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : typeof value === "number" ? (
          <CountUp value={value} formatter={formatter} />
        ) : (
          value
        )}
      </span>
    </div>
  );
}
