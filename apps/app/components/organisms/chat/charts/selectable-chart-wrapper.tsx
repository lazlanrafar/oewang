"use client";

import type { ReactNode } from "react";

interface SelectableChartWrapperProps<T extends Record<string, unknown> = Record<string, unknown>> {
  children: ReactNode;
  data: T[];
  dateKey: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
  chartType?: string;
}

export function SelectableChartWrapper<T extends Record<string, unknown>>({
  children,
  enableSelection = false,
}: SelectableChartWrapperProps<T>) {
  // Chart selection is not enabled in Oewang canvas - just render children
  if (!enableSelection) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
