"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useArtifacts } from "@ai-sdk-tools/artifacts/client";
import { useChatMessages } from "@ai-sdk-tools/store";
import { cn, Icons, Loader } from "@workspace/ui";
import type { UIMessage } from "ai";
import { parseAsString, useQueryState } from "nuqs";

import { useAppStore } from "@/stores/app";
import { getDictionaryText } from "../chat-i18n";
import { BurnRateCanvas } from "./chat-canvas-burn-rate";
import { CanvasErrorBoundary } from "./chat-canvas-error-boundary";
import { CanvasErrorFallback } from "./chat-canvas-error-fallback";
import { RevenueCanvas } from "./chat-canvas-revenue";
import { SpendingCanvas } from "./chat-canvas-spending";

type ArtifactPayload = Record<string, unknown> | null;
type ArtifactEntry = {
  id: string;
  type: string;
  payload: ArtifactPayload;
  promptText: string;
};

function extractTextFromMessageParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => ((part as { text?: string }).text ?? ""))
    .join(" ")
    .trim();
}

function getPayloadDateRange(payload: ArtifactPayload): { from?: Date; to?: Date } {
  if (!payload) return {};
  const fromValue = payload.from;
  const toValue = payload.to;
  const from = typeof fromValue === "string" ? new Date(fromValue) : undefined;
  const to = typeof toValue === "string" ? new Date(toValue) : undefined;

  if (from && Number.isNaN(from.getTime())) return { to };
  if (to && Number.isNaN(to.getTime())) return { from };

  return { from, to };
}

function formatRangeLabel(range: { from?: Date; to?: Date }, locale: string): string | null {
  const { from, to } = range;
  if (!from || !to) return null;

  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();

  if (sameMonth) {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(from);
  }

  if (sameYear) {
    const fromShort = new Intl.DateTimeFormat(locale, { month: "short" }).format(from);
    const toShort = new Intl.DateTimeFormat(locale, { month: "short" }).format(to);
    return `${fromShort} - ${toShort} ${from.getFullYear()}`;
  }

  const fromLabel = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(from);
  const toLabel = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(to);
  return `${fromLabel} - ${toLabel}`;
}

function inferArtifactInstanceLabel(
  type: string,
  entry: ArtifactEntry,
  locale: string,
  t: (key: string, fallback: string) => string,
): string {
  const baseLabels: Record<string, string> = {
    "revenue-canvas": t("chat.canvas.tabs.income", "Income"),
    "burn-rate-canvas": t("chat.canvas.tabs.burn_rate", "Burn Rate"),
    "spending-canvas": t("chat.canvas.tabs.expense", "Expense"),
  };
  const baseLabel = baseLabels[type] ?? type;

  const prompt = entry.promptText.toLowerCase();
  const range = getPayloadDateRange(entry.payload);
  const rangeLabel = formatRangeLabel(range, locale);

  if (
    type === "spending-canvas" &&
    (prompt.includes("tahun ini") || prompt.includes("this year") || prompt.includes("year to date") || prompt.includes("今年"))
  ) {
    return t("chat.canvas.tabs.expense_this_year", "Expense this year");
  }
  if (
    type === "spending-canvas" &&
    (prompt.includes("bulan ini") || prompt.includes("this month") || prompt.includes("今月"))
  ) {
    return t("chat.canvas.tabs.expense_this_month", "Expense this month");
  }

  if (rangeLabel) {
    return `${baseLabel} · ${rangeLabel}`;
  }

  if (entry.promptText) {
    const shortPrompt = entry.promptText.length > 38 ? `${entry.promptText.slice(0, 35)}...` : entry.promptText;
    return `${baseLabel} · ${shortPrompt}`;
  }

  return baseLabel;
}

export function useAllArtifactEntries(): ArtifactEntry[] {
  const messages = useChatMessages();

  return useMemo(() => {
    const entries: ArtifactEntry[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg?.parts || msg.role !== "assistant") continue;

      for (let partIndex = 0; partIndex < msg.parts.length; partIndex++) {
        const part = msg.parts[partIndex];
        if (!part) continue;
        const partType = part.type as string;
        if (!(partType.startsWith("data-artifact-") || partType === "artifact")) continue;

        const artifactPart = part as {
          artifactType?: string;
          data?: { type?: string; payload?: unknown };
          artifact?: { payload?: unknown };
        };
        const actualType =
          artifactPart.artifactType ??
          artifactPart.data?.type ??
          (partType.startsWith("data-artifact-") ? partType.replace("data-artifact-", "") : undefined);
        if (!actualType) continue;

        let promptText = "";
        for (let j = i - 1; j >= 0; j--) {
          const candidate = messages[j];
          if (!candidate?.parts || candidate.role !== "user") continue;
          const text = extractTextFromMessageParts(candidate.parts);
          if (text) {
            promptText = text;
            break;
          }
        }

        entries.push({
          id: `${msg.id}-${partIndex}`,
          type: actualType,
          payload: (artifactPart.artifact?.payload ?? artifactPart.data?.payload ?? null) as ArtifactPayload,
          promptText,
        });
      }
    }

    return entries;
  }, [messages]);
}

export function useArtifactEntries(type: string): ArtifactEntry[] {
  const allEntries = useAllArtifactEntries();
  return useMemo(() => allEntries.filter((entry) => entry.type === type), [allEntries, type]);
}

export function useStaticArtifactData(type: string) {
  const entries = useArtifactEntries(type);
  return entries.length > 0 ? entries[entries.length - 1]?.payload ?? null : null;
}

export function ArtifactTabs() {
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string) => getDictionaryText(dictionary, key, fallback);
  const locale =
    typeof document !== "undefined" && document.documentElement.lang
      ? document.documentElement.lang
      : typeof navigator !== "undefined"
        ? navigator.language
        : "en-US";
  const [selectedType, setSelectedType] = useQueryState("artifact-type", parseAsString);
  const [selectedInstance, setSelectedInstance] = useQueryState("artifact-instance", parseAsString);
  const [hiddenEntryIds, setHiddenEntryIds] = useState<string[]>([]);
  const allEntries = useAllArtifactEntries();

  const [data, actions] = useArtifacts({
    value: selectedType ?? undefined,
    onChange: (v: string | null) => setSelectedType(v ?? null),
    exclude: ["chat-title", "suggestions"],
  });

  const { available, activeType } = data;

  const entriesByType = useMemo(() => {
    const grouped = new Map<string, ArtifactEntry[]>();
    for (const entry of allEntries) {
      if (hiddenEntryIds.includes(entry.id)) continue;
      if (!grouped.has(entry.type)) grouped.set(entry.type, []);
      grouped.get(entry.type)?.push(entry);
    }
    return grouped;
  }, [allEntries, hiddenEntryIds]);

  useEffect(() => {
    if (selectedType && available.includes(selectedType) && activeType !== selectedType) {
      actions.setValue(selectedType);
    }
  }, [selectedType, available, activeType, actions]);

  useEffect(() => {
    if (hiddenEntryIds.length === 0) return;
    const validIds = new Set(allEntries.map((entry) => entry.id));
    const cleaned = hiddenEntryIds.filter((id) => validIds.has(id));
    if (cleaned.length !== hiddenEntryIds.length) {
      setHiddenEntryIds(cleaned);
    }
  }, [allEntries, hiddenEntryIds]);

  const handleDismiss = useCallback(
    (e: React.MouseEvent, type: string, instanceId?: string | null) => {
      e.preventDefault();
      e.stopPropagation();

      const typeEntries = entriesByType.get(type) ?? [];
      const visibleEntries = instanceId ? typeEntries.filter((entry) => entry.id !== instanceId) : [];

      if (instanceId) {
        setHiddenEntryIds((prev) => (prev.includes(instanceId) ? prev : [...prev, instanceId]));

        if (visibleEntries.length > 0) {
          if (type === activeType && selectedInstance === instanceId) {
            const nextEntry = visibleEntries[visibleEntries.length - 1];
            if (nextEntry) {
              actions.setValue(type);
              setSelectedType(type);
              setSelectedInstance(nextEntry.id);
            }
          }
          return;
        }
      }

      if (available.length === 1) {
        actions.setValue(null);
        setSelectedType(null);
        setSelectedInstance(null);
        actions.dismiss(type);
        return;
      }

      actions.dismiss(type);

      if (type === activeType) {
        const otherTypes = available.filter((tItem: string) => tItem !== type);
        if (otherTypes.length > 0) {
          const nextType = otherTypes[0] ?? null;
          actions.setValue(nextType);
          setSelectedType(nextType);
        } else {
          actions.setValue(null);
          setSelectedType(null);
        }
      }

      setSelectedInstance(null);
    },
    [activeType, available, actions, entriesByType, selectedInstance, setSelectedType, setSelectedInstance],
  );

  if (!available || available.length === 0) {
    return null;
  }

  const tabItems = available.flatMap((type: string) => {
    const typeEntries = entriesByType.get(type) ?? [];

    if (typeEntries.length > 1) {
      return typeEntries.map((entry) => ({
        key: `${type}::${entry.id}`,
        type,
        instanceId: entry.id,
        label: inferArtifactInstanceLabel(type, entry, locale, t),
      }));
    }

    const fallbackLabel = inferArtifactInstanceLabel(
      type,
      typeEntries[0] ?? { id: type, type, payload: null, promptText: "" },
      locale,
      t,
    );

    return [
      {
        key: type,
        type,
        instanceId: null as string | null,
        label: fallbackLabel,
      },
    ];
  });

  return (
    <div className="h-10 max-h-10 min-h-10 overflow-x-auto overflow-y-hidden border-[#e6e6e6] border-b bg-[#fdfdfc] px-2 sm:px-4 dark:border-[#1d1d1d] dark:bg-[#0c0c0c]">
      <div className="flex h-full min-w-full items-center gap-1">
      {tabItems.map((tab) => {
        const typeEntries = entriesByType.get(tab.type) ?? [];
        const hasInstances = typeEntries.length > 1;
        const isActive =
          tab.type === activeType && (hasInstances ? selectedInstance === tab.instanceId : !selectedInstance || tab.instanceId === null);

        return (
          <div
            key={tab.key}
            className={cn(
              "group flex h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 sm:px-3 font-medium text-[12px] sm:text-[13px] transition-all",
              isActive
                ? "border-black text-black dark:border-white dark:text-white"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => {
                actions.setValue(tab.type);
                setSelectedType(tab.type);
                setSelectedInstance(tab.instanceId);
              }}
              className="flex h-full items-center text-left"
            >
              {tab.label}
            </button>
            <button
              type="button"
              aria-label={t("chat.canvas.tabs.close_tab", "Close tab")}
              className="ml-0 flex h-4 w-0 items-center justify-center overflow-hidden text-muted-foreground opacity-0 transition-all hover:text-primary focus:ml-1.5 focus:w-4 focus:opacity-100 focus:outline-none group-hover:ml-1.5 group-hover:w-4 group-hover:opacity-100"
              onClick={(e) => handleDismiss(e, tab.type, tab.instanceId)}
            >
              <Icons.Close className="size-3" />
            </button>
          </div>
        );
      })}
      </div>
    </div>
  );
}

export function Canvas() {
  const dictionary = useAppStore((state) => state.dictionary);
  const t = (key: string, fallback: string) => getDictionaryText(dictionary, key, fallback);
  const [selectedType, setSelectedType] = useQueryState("artifact-type", parseAsString);
  const [selectedInstance, setSelectedInstance] = useQueryState("artifact-instance", parseAsString);
  const allEntries = useAllArtifactEntries();

  const [selection, actions] = useArtifacts({
    value: selectedType,
    onChange: (v) => setSelectedType(v ?? null),
    exclude: ["chat-title", "suggestions"],
  });

  const activeType = selection.activeType;
  const available = selection.available;
  const activeEntries = useMemo(() => allEntries.filter((entry) => entry.type === activeType), [allEntries, activeType]);

  const selectedPayload =
    selectedInstance && activeEntries.length > 0
      ? activeEntries.find((entry) => entry.id === selectedInstance)?.payload ?? null
      : activeEntries[activeEntries.length - 1]?.payload ?? null;

  useEffect(() => {
    if (selectedType && available.includes(selectedType) && activeType !== selectedType) {
      actions.setValue(selectedType);
    }
  }, [selectedType, available, activeType, actions]);

  useEffect(() => {
    if (!activeType) return;

    if (activeEntries.length <= 1) {
      if (selectedInstance) setSelectedInstance(null);
      return;
    }

    if (!selectedInstance || !activeEntries.some((entry) => entry.id === selectedInstance)) {
      const latest = activeEntries[activeEntries.length - 1];
      if (latest) setSelectedInstance(latest.id);
    }
  }, [activeType, activeEntries, selectedInstance, setSelectedInstance]);

  const renderCanvas = useCallback(() => {
    switch (activeType) {
      case "revenue-canvas":
        return <RevenueCanvas dataOverride={selectedPayload as Record<string, unknown> | null} />;
      case "spending-canvas":
        return <SpendingCanvas dataOverride={selectedPayload as Record<string, unknown> | null} />;
      case "burn-rate-canvas":
        return <BurnRateCanvas dataOverride={selectedPayload as Record<string, unknown> | null} />;
      default:
        if (selectedType) {
          return (
            <div className="flex h-full flex-col items-center justify-center space-y-4">
              <Loader className="size-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">
                {t("chat.canvas.loading.generating_analysis", "Generating analysis...")}
              </p>
            </div>
          );
        }
        return null;
    }
  }, [activeType, selectedType, selectedPayload, t]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto bg-[#fdfdfc] dark:bg-[#0c0c0c]">
      <CanvasErrorBoundary key={activeType ?? "no-artifact"} fallback={<CanvasErrorFallback />}>
        {renderCanvas()}
      </CanvasErrorBoundary>
    </div>
  );
}
