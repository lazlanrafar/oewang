"use client";

import { useMemo } from "react";

interface ChartSelectionOverlayProps {
  data: Record<string, unknown>[];
  selection: {
    startIndex: number | null;
    endIndex: number | null;
    isSelecting: boolean;
  };
  containerWidth: number;
  containerHeight: number;
}

export function ChartSelectionOverlay({ data, selection, containerWidth }: ChartSelectionOverlayProps) {
  const overlayStyles = useMemo(() => {
    if (selection.startIndex === null || selection.endIndex === null || data.length === 0) {
      return null;
    }

    const minIndex = Math.min(selection.startIndex, selection.endIndex);
    const maxIndex = Math.max(selection.startIndex, selection.endIndex);

    // Calculate positions
    const marginLeft = 0;
    const marginRight = 6;
    const plotWidth = containerWidth - marginLeft - marginRight;
    const barWidth = plotWidth / data.length;

    const startPos = marginLeft + minIndex * barWidth;
    const endPos = marginLeft + (maxIndex + 1) * barWidth;
    const width = Math.abs(endPos - startPos);

    return {
      startPos,
      endPos,
      width,
    };
  }, [data.length, selection.startIndex, selection.endIndex, containerWidth]);

  if (!overlayStyles) {
    return null;
  }

  return (
    <>
      {/* Selection overlay - shaded rectangle */}
      <div
        className="chart-selection-overlay pointer-events-none absolute top-0 bottom-0"
        style={{
          left: `${overlayStyles.startPos}px`,
          width: `${overlayStyles.width}px`,
          background: "rgba(0, 0, 0, 0.08)",
          zIndex: 1,
        }}
      />
      {/* Start line */}
      <div
        className="chart-selection-border pointer-events-none absolute top-0 bottom-0"
        style={{
          left: `${overlayStyles.startPos}px`,
          width: "1px",
          borderLeft: "1px dashed #666666",
          zIndex: 2,
        }}
      />
      {/* End line */}
      <div
        className="chart-selection-border pointer-events-none absolute top-0 bottom-0"
        style={{
          left: `${overlayStyles.endPos}px`,
          width: "1px",
          borderLeft: "1px dashed #666666",
          zIndex: 2,
        }}
      />
    </>
  );
}
