import { createLogger } from "@workspace/logger";
import { buildSuccess } from "@workspace/utils";
import { AiSidecarClient } from "../ai/ai-sidecar-client";
import { CategoriesRepository } from "../categories/categories.repository";
import type { ReviewRowInput } from "./transactions.model";
import { TransactionsRepository } from "./transactions.repository";

const log = createLogger("transactions-review");

const DUPLICATE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export type ImportReviewSuggestion = {
  rowIndex: number;
  type: "category" | "type_sign" | "duplicate" | "anomaly";
  field: "categoryId" | "amount" | "type" | null;
  currentValue: string | null;
  suggestedValue: string | null;
  reason: string;
  confidence: number | null;
  meta?: Record<string, unknown>;
};

// Rows the AI/import-review stage runs against — not yet persisted, still
// mutable client-side. Reviewing these never writes to the DB and never
// calls AuditLogsService; the only mutation is the final /transactions/bulk
// commit the client makes afterward with whatever it accepted.
export abstract class TransactionsReviewService {
  /** Pure SQL, no AI sidecar call, no quota cost. Never blocks import — a DB
   * error degrades to an empty suggestion list rather than failing. */
  static async checkDuplicates(workspaceId: string, rows: ReviewRowInput[]) {
    if (rows.length === 0) {
      return buildSuccess({ suggestions: [] as ImportReviewSuggestion[] });
    }

    try {
      const walletIds = [...new Set(rows.map((r) => r.walletId))].filter(
        Boolean,
      );
      const rowTimes = rows
        .map((r) => new Date(r.date).getTime())
        .filter((t) => !Number.isNaN(t));

      if (walletIds.length === 0 || rowTimes.length === 0) {
        return buildSuccess({ suggestions: [] as ImportReviewSuggestion[] });
      }

      const startDate = new Date(
        Math.min(...rowTimes) - DUPLICATE_WINDOW_MS,
      ).toISOString();
      const endDate = new Date(
        Math.max(...rowTimes) + DUPLICATE_WINDOW_MS,
      ).toISOString();

      const existing = await TransactionsRepository.findPotentialDuplicates(
        workspaceId,
        walletIds,
        startDate,
        endDate,
      );

      const suggestions: ImportReviewSuggestion[] = [];
      rows.forEach((row, rowIndex) => {
        const rowTime = new Date(row.date).getTime();
        if (Number.isNaN(rowTime)) return;
        const rowAmount = Number(row.amount);
        if (Number.isNaN(rowAmount)) return;

        const match = existing.find((tx) => {
          if (tx.walletId !== row.walletId || tx.type !== row.type) {
            return false;
          }
          if (
            row.type === "transfer" &&
            (tx.toWalletId || undefined) !== row.toWalletId
          ) {
            return false;
          }
          const dayDiff =
            Math.abs(new Date(tx.date).getTime() - rowTime) /
            (24 * 60 * 60 * 1000);
          if (dayDiff > 3) return false;
          return Math.abs(Number(tx.amount) - rowAmount) < 0.01;
        });

        if (match) {
          suggestions.push({
            rowIndex,
            type: "duplicate",
            field: null,
            currentValue: null,
            suggestedValue: null,
            reason: `Possible duplicate of a transaction on ${match.date.slice(0, 10)}${match.name ? ` ("${match.name}")` : ""}`,
            confidence: null,
            meta: {
              matchedTransactionId: match.id,
              matchedDate: match.date,
              matchedAmount: match.amount,
              matchedName: match.name,
            },
          });
        }
      });

      return buildSuccess({ suggestions });
    } catch (error) {
      log.error("duplicate check failed", { error });
      return buildSuccess({ suggestions: [] as ImportReviewSuggestion[] });
    }
  }

  /** Deterministic sign/type checks always run; the LLM-backed category +
   * type suggestions degrade gracefully (quota exceeded or sidecar down)
   * without dropping the deterministic ones. */
  static async categorize(workspaceId: string, rows: ReviewRowInput[]) {
    const suggestions: ImportReviewSuggestion[] = [];

    rows.forEach((row, rowIndex) => {
      const amount = Number(row.amount);
      if (Number.isNaN(amount) || amount >= 0) return;
      if (row.type !== "expense" && row.type !== "income") return;
      suggestions.push({
        rowIndex,
        type: "type_sign",
        field: "amount",
        currentValue: row.amount,
        suggestedValue: Math.abs(amount).toString(),
        reason: `${row.type === "expense" ? "Expense" : "Income"} amount is negative — amounts are stored as positive, with type deciding the direction.`,
        confidence: null,
      });
    });

    let degraded: { reason: "ai_unavailable" | "quota_exceeded" } | undefined;
    try {
      const categories = await CategoriesRepository.findMany(workspaceId);
      const nameToId = new Map(categories.map((c) => [c.name, c.id]));

      const reviewRows = rows.map((r, index) => ({
        index,
        name: r.name ?? null,
        description: r.description ?? null,
        amount: Number(r.amount),
        type: r.type,
        hasCategoryId: Boolean(r.categoryId),
      }));

      const { results } = await AiSidecarClient.reviewTransactionRows(
        reviewRows,
        categories.map((c) => c.name),
        workspaceId,
      );

      for (const r of results) {
        if (r.field === "category") {
          const categoryId = nameToId.get(r.suggestedValue);
          if (!categoryId) continue;
          suggestions.push({
            rowIndex: r.index,
            type: "category",
            field: "categoryId",
            currentValue: null,
            suggestedValue: categoryId,
            reason: r.reason || `Suggested category: ${r.suggestedValue}`,
            confidence: r.confidence,
            meta: { categoryName: r.suggestedValue },
          });
        } else if (r.field === "type") {
          suggestions.push({
            rowIndex: r.index,
            type: "type_sign",
            field: "type",
            currentValue: rows[r.index]?.type ?? null,
            suggestedValue: r.suggestedValue,
            reason: r.reason,
            confidence: r.confidence,
          });
        }
      }
    } catch (error: any) {
      if (error?.status === 422 && error?.body?.error === "PLAN_LIMIT_REACHED") {
        degraded = { reason: "quota_exceeded" };
      } else {
        log.error("categorize review failed", { error });
        degraded = { reason: "ai_unavailable" };
      }
    }

    return buildSuccess({ suggestions, ...(degraded ? { degraded } : {}) });
  }

  /** Scores expense rows against the workspace's own history via the
   * sidecar's statistical (non-LLM) anomaly model. No quota cost. */
  static async anomalies(workspaceId: string, rows: ReviewRowInput[]) {
    try {
      const expenseIndices = rows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => row.type === "expense");

      if (expenseIndices.length === 0) {
        return buildSuccess({ suggestions: [] as ImportReviewSuggestion[] });
      }

      const categoryIds = [
        ...new Set(
          rows.map((r) => r.categoryId).filter((id): id is string => !!id),
        ),
      ];
      let idToName = new Map<string, string>();
      if (categoryIds.length > 0) {
        const categories = await CategoriesRepository.findMany(workspaceId);
        idToName = new Map(categories.map((c) => [c.id, c.name]));
      }

      const candidates = expenseIndices.map(({ row, index }) => ({
        index,
        amount: Math.abs(Number(row.amount)),
        date: row.date,
        category: row.categoryId
          ? (idToName.get(row.categoryId) ?? null)
          : null,
      }));

      const anomalies = await AiSidecarClient.detectAnomalyCandidates(
        candidates,
        workspaceId,
      );

      const suggestions: ImportReviewSuggestion[] = anomalies.map((a) => ({
        rowIndex: a.index,
        type: "anomaly",
        field: null,
        currentValue: null,
        suggestedValue: null,
        reason: a.reason,
        confidence: null,
        meta: { severity: a.severity },
      }));

      return buildSuccess({ suggestions });
    } catch (error) {
      log.error("anomaly detection failed", { error });
      return buildSuccess({
        suggestions: [] as ImportReviewSuggestion[],
        degraded: { reason: "service_unavailable" as const },
      });
    }
  }
}
