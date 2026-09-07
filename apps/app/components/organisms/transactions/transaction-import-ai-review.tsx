"use client";

import { useCallback, useRef, useState } from "react";

import {
  categorizeAndValidateTransactions,
  checkDuplicateTransactions,
  detectAnomalousTransactions,
  type ImportReviewRow,
} from "@workspace/modules/import/import-review.action";
import { AnimatedStatus, Button, Progress } from "@workspace/ui";
import { AlertCircle, CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { motion } from "framer-motion";

import type { AiStageKey, AiStageStatus, ImportSuggestion, TransactionDraft } from "./transaction-import-context";

const AI_REVIEW_STAGES: { key: AiStageKey; label: string; runningLabel: string }[] = [
  { key: "duplicates", label: "Checking for duplicates", runningLabel: "Checking for duplicates…" },
  { key: "categorize", label: "Categorizing & validating", runningLabel: "Categorizing & validating…" },
  { key: "anomalies", label: "Detecting unusual amounts", runningLabel: "Detecting unusual amounts…" },
];

function toReviewRows(transactions: TransactionDraft[]): ImportReviewRow[] {
  return transactions.map((t) => ({
    walletId: t.walletId,
    amount: t.amount,
    date: t.date,
    type: t.type,
    name: t.name,
    categoryId: t.categoryId,
    description: t.description,
  }));
}

let suggestionSeq = 0;
function nextSuggestionId(prefix: string) {
  suggestionSeq += 1;
  return `${prefix}-${suggestionSeq}`;
}

export function useAiReviewOrchestrator(
  transactions: TransactionDraft[] | null,
  onSettled: (suggestions: ImportSuggestion[], degraded: boolean) => void,
) {
  const [aiStageStatus, setAiStageStatus] = useState<Record<AiStageKey, AiStageStatus>>({
    duplicates: "pending",
    categorize: "pending",
    anomalies: "pending",
  });
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setAiStageStatus({ duplicates: "pending", categorize: "pending", anomalies: "pending" });
  }, []);

  const run = useCallback(async () => {
    if (!transactions || transactions.length === 0) {
      onSettled([], false);
      return;
    }
    const rows = toReviewRows(transactions);
    const collected: ImportSuggestion[] = [];
    // Tracked locally (not read back from React state) so the final degraded
    // flag can't be computed from a stale/not-yet-flushed status value.
    let anyErrored = false;

    setAiStageStatus((s) => ({ ...s, duplicates: "running" }));
    try {
      const res = await checkDuplicateTransactions(rows);
      if (cancelledRef.current) return;
      if (res.success) {
        collected.push(
          ...res.data.suggestions.map((s) => ({ ...s, id: nextSuggestionId("dup"), accepted: false })),
        );
        setAiStageStatus((s) => ({ ...s, duplicates: "done" }));
      } else {
        anyErrored = true;
        setAiStageStatus((s) => ({ ...s, duplicates: "error" }));
      }
    } catch {
      anyErrored = true;
      if (!cancelledRef.current) setAiStageStatus((s) => ({ ...s, duplicates: "error" }));
    }
    if (cancelledRef.current) return;

    setAiStageStatus((s) => ({ ...s, categorize: "running" }));
    try {
      const res = await categorizeAndValidateTransactions(rows);
      if (cancelledRef.current) return;
      if (res.success) {
        collected.push(
          ...res.data.suggestions.map((s) => ({ ...s, id: nextSuggestionId("cat"), accepted: false })),
        );
        if (res.data.degraded) anyErrored = true;
        setAiStageStatus((s) => ({ ...s, categorize: res.data.degraded ? "error" : "done" }));
      } else {
        anyErrored = true;
        setAiStageStatus((s) => ({ ...s, categorize: "error" }));
      }
    } catch {
      anyErrored = true;
      if (!cancelledRef.current) setAiStageStatus((s) => ({ ...s, categorize: "error" }));
    }
    if (cancelledRef.current) return;

    setAiStageStatus((s) => ({ ...s, anomalies: "running" }));
    try {
      const res = await detectAnomalousTransactions(rows);
      if (cancelledRef.current) return;
      if (res.success) {
        collected.push(
          ...res.data.suggestions.map((s) => ({ ...s, id: nextSuggestionId("anom"), accepted: false })),
        );
        if (res.data.degraded) anyErrored = true;
        setAiStageStatus((s) => ({ ...s, anomalies: res.data.degraded ? "error" : "done" }));
      } else {
        anyErrored = true;
        setAiStageStatus((s) => ({ ...s, anomalies: "error" }));
      }
    } catch {
      anyErrored = true;
      if (!cancelledRef.current) setAiStageStatus((s) => ({ ...s, anomalies: "error" }));
    }
    if (cancelledRef.current) return;

    onSettled(collected, anyErrored);
  }, [transactions, onSettled]);

  const skip = useCallback(() => {
    cancelledRef.current = true;
    setAiStageStatus((s) => ({
      duplicates: s.duplicates === "done" || s.duplicates === "error" ? s.duplicates : "skipped",
      categorize: s.categorize === "done" || s.categorize === "error" ? s.categorize : "skipped",
      anomalies: s.anomalies === "done" || s.anomalies === "error" ? s.anomalies : "skipped",
    }));
    onSettled([], true);
  }, [onSettled]);

  return { aiStageStatus, run, skip, reset };
}

function StageIcon({ status }: { status: AiStageStatus }) {
  if (status === "pending") return <Circle className="h-4 w-4 text-muted-foreground/40" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-muted-foreground/50" />;
}

interface AiReviewProps {
  aiStageStatus: Record<AiStageKey, AiStageStatus>;
  onSkip: () => void;
}

export function AiReview({ aiStageStatus, onSkip }: AiReviewProps) {
  const settledCount = AI_REVIEW_STAGES.filter((s) => aiStageStatus[s.key] !== "pending" && aiStageStatus[s.key] !== "running").length;
  const allSettled = AI_REVIEW_STAGES.every((s) => aiStageStatus[s.key] !== "pending" && aiStageStatus[s.key] !== "running");

  return (
    <div className="flex flex-col gap-6 py-4">
      <Progress value={(settledCount / AI_REVIEW_STAGES.length) * 100} className="h-1" />

      <ul className="flex flex-col gap-4">
        {AI_REVIEW_STAGES.map((stage, i) => {
          const status = aiStageStatus[stage.key];
          return (
            <motion.li
              key={stage.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25, ease: "easeOut" }}
              className="flex items-center gap-3"
            >
              <StageIcon status={status} />
              {status === "running" ? (
                <AnimatedStatus text={stage.runningLabel} variant="fade" className="text-sm" />
              ) : (
                <span
                  className={
                    status === "error"
                      ? "text-sm text-amber-600"
                      : status === "pending"
                        ? "text-sm text-muted-foreground/50"
                        : "text-sm"
                  }
                >
                  {status === "error"
                    ? `${stage.label} — AI unavailable, continuing without it`
                    : stage.label}
                </span>
              )}
            </motion.li>
          );
        })}
        <motion.li
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: allSettled ? 1 : 0, y: allSettled ? 0 : 6 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex items-center gap-3"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm">Ready to review</span>
        </motion.li>
      </ul>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip AI review
        </Button>
      </div>
    </div>
  );
}
