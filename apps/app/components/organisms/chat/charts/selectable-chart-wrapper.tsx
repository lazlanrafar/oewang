"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChartSelectionOverlay } from "./chart-selection-overlay";

interface SelectableChartWrapperProps {
  children: ReactNode;
  data: any[];
  dateKey: string;
  enableSelection?: boolean;
  onSelectionChange?: (startDate: string | null, endDate: string | null) => void;
  onSelectionComplete?: (startDate: string, endDate: string) => void;
  onSelectionStateChange?: (isSelecting: boolean) => void;
  chartType?: string;
}

export function SelectableChartWrapper({
  children,
  enableSelection = false,
}: SelectableChartWrapperProps) {
  // Chart selection is not enabled in Okane canvas - just render children
  if (!enableSelection) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
