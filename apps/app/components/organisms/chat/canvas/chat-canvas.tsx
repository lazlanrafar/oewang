"use client";

import { useArtifacts } from "@ai-sdk-tools/artifacts/client";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useEffect } from "react";
import { useChatMessages } from "@ai-sdk-tools/store";
import { CanvasErrorBoundary } from "./chat-canvas-error-boundary";
import { CanvasErrorFallback } from "./chat-canvas-error-fallback";
import { Icons, Button, cn, Loader } from "@workspace/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";

import { RevenueCanvas } from "./chat-canvas-revenue";
import { SpendingCanvas } from "./chat-canvas-spending";
import { BurnRateCanvas } from "./chat-canvas-burn-rate";

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  "revenue-canvas": "Revenue",
  "burn-rate-canvas": "Burn Rate",
  "spending-canvas": "Spending",
};

export function useStaticArtifactData(type: string) {
  const messages = useChatMessages();

  return useMemo(() => {
    // Search from newest to oldest
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg?.parts) continue;

      for (const part of msg.parts) {
        if (
          part.type === `data-artifact-${type}` ||
          (part.type as string) === "artifact"
        ) {
          const artifactPart = part as any;
          const actualType =
            artifactPart.artifactType || artifactPart.data?.type;
          if (actualType === type) {
            return (
              artifactPart.artifact?.payload ||
              artifactPart.data?.payload ||
              null
            );
          }
        }
      }
    }
    return null;
  }, [messages, type]);
}

export function ArtifactTabs() {
  const [selectedType, setSelectedType] = useQueryState(
    "artifact-type",
    parseAsString,
  );

  const [data, actions] = useArtifacts({
    value: selectedType ?? undefined,
    onChange: (v: string | null) => setSelectedType(v ?? null),
    exclude: ["chat-title", "suggestions"],
  });

  const { available, activeType } = data;

  // Sync selectedType from URL to store activation
  useEffect(() => {
    if (
      selectedType &&
      available?.includes(selectedType) &&
      activeType !== selectedType
    ) {
      actions.setValue(selectedType);
    }
  }, [selectedType, available, activeType, actions]);

  const handleTabClick = useCallback(
    (type: string) => {
      actions.setValue(type);
      setSelectedType(type);
    },
    [actions, setSelectedType],
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent, type: string) => {
      e.stopPropagation();

      if (available.length === 1) {
        actions.setValue(null);
        setSelectedType(null);
      } else if (type === activeType) {
        const otherTypes = available.filter((t: string) => t !== type);
        if (otherTypes.length > 0) {
          actions.setValue(otherTypes[0] ?? null);
          setSelectedType(otherTypes[0] ?? null);
        }
      }

      actions.dismiss(type);
    },
    [activeType, available, actions, setSelectedType],
  );

  if (!available || available.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 h-10 min-h-10 max-h-10 border-b border-[#e6e6e6] dark:border-[#1d1d1d] bg-[#fdfdfc] dark:bg-[#0c0c0c] px-4">
      {available.map((type: string) => {
        const isActive = type === activeType;
        const label = ARTIFACT_TYPE_LABELS[type] || type;

        return (
          <div
            key={type}
            className={cn(
              "group flex items-center px-3 h-10 text-[13px] font-medium transition-all whitespace-nowrap border-b-2",
              isActive
                ? "border-black dark:border-white text-black dark:text-white"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => handleTabClick(type)}
              className="text-left h-full flex items-center"
            >
              {label}
            </button>
            <button
              type="button"
              className="h-4 w-0 opacity-0 ml-0 group-hover:w-4 group-hover:opacity-100 group-hover:ml-2 focus:w-4 focus:opacity-100 focus:ml-2 transition-all overflow-hidden flex items-center justify-center focus:outline-none text-muted-foreground hover:text-primary"
              onClick={(e) => handleDismiss(e, type)}
            >
              <Icons.Close className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Canvas() {
  const [selectedType, setSelectedType] = useQueryState(
    "artifact-type",
    parseAsString,
  );

  const [selection, actions] = useArtifacts({
    value: selectedType,
    onChange: (v) => setSelectedType(v ?? null),
    exclude: ["chat-title", "suggestions"],
  });

  const activeType = selection?.activeType;
  const available = selection?.available;

  // Sync selectedType from URL to store activation
  useEffect(() => {
    if (
      selectedType &&
      available?.includes(selectedType) &&
      activeType !== selectedType
    ) {
      console.log("[Canvas] Activating from URL:", selectedType);
      actions.setValue(selectedType);
    }
  }, [selectedType, available, activeType, actions]);

  // Debug for hydration
  console.log("[Canvas] Sync:", {
    selectedType,
    activeType,
    availableCount: available?.length,
    available,
  });

  const renderCanvas = useCallback(() => {
    if (!activeType && selectedType && available?.includes(selectedType)) {
      // If we have a type from URL but store hasn't marked it active yet
      // but it IS available, we can try to render it or wait.
      // Usually useArtifacts(value) handles this, but maybe it needs help.
    }

    switch (activeType) {
      case "revenue-canvas":
        return <RevenueCanvas />;
      case "spending-canvas":
        return <SpendingCanvas />;
      case "burn-rate-canvas":
        return <BurnRateCanvas />;
      default:
        // Loading state if we have a selection but No activeType yet
        if (selectedType) {
          return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <Loader className="size-8 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Generating analysis...
              </p>
            </div>
          );
        }
        return null;
    }
  }, [activeType, selectedType, available]);

  return (
    <div className="h-full flex flex-col relative bg-[#fdfdfc] dark:bg-[#0c0c0c] overflow-y-auto w-full">
      <CanvasErrorBoundary key={activeType} fallback={<CanvasErrorFallback />}>
        {renderCanvas()}
      </CanvasErrorBoundary>
    </div>
  );
}
