/**
 * Pure helpers for the AI "quick recall" feature: turning a list of past
 * matching transactions into per-name price suggestions the agent can use to
 * propose a new transaction (e.g. user types "buy In Mild" → recall the usual
 * price, wallet, and category from "In Mild Cigarette").
 */

export type RecallRow = {
  name: string | null;
  amount: string;
  type: string;
  date: string;
  walletId: string;
  walletName: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export type RecallSuggestion = {
  name: string;
  type: string;
  count: number;
  lastAmount: number;
  avgAmount: number;
  minAmount: number;
  maxAmount: number;
  lastDate: string;
  walletId: string;
  walletName: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

/** Normalise a transaction name for grouping (case/space-insensitive). */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Group matching transactions by name and compute price statistics for each.
 *
 * Rows are expected sorted most-recent-first (as the repository returns them),
 * but this function re-sorts each group defensively so the "last" values are
 * always the most recent. Transfers and rows with empty names or non-numeric
 * amounts are skipped.
 *
 * Suggestions are ordered by frequency (count desc), then most recent first,
 * and capped at `maxSuggestions`.
 */
export function aggregateRecall(
  rows: RecallRow[],
  maxSuggestions = 5,
): RecallSuggestion[] {
  const groups = new Map<string, RecallRow[]>();

  for (const row of rows) {
    if (row.type === "transfer") continue;
    if (!row.name || !row.name.trim()) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const key = normalizeName(row.name);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const suggestions: RecallSuggestion[] = [];

  for (const bucket of groups.values()) {
    // Most recent first.
    const sorted = [...bucket].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
    );
    const latest = sorted[0]!;
    const amounts = sorted.map((r) => Number(r.amount));
    const sum = amounts.reduce((acc, n) => acc + n, 0);

    suggestions.push({
      name: latest.name!.trim(),
      type: latest.type,
      count: sorted.length,
      lastAmount: Number(latest.amount),
      avgAmount: Math.round(sum / amounts.length),
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      lastDate: latest.date,
      walletId: latest.walletId,
      walletName: latest.walletName,
      categoryId: latest.categoryId,
      categoryName: latest.categoryName,
    });
  }

  suggestions.sort((a, b) =>
    b.count !== a.count
      ? b.count - a.count
      : a.lastDate < b.lastDate
        ? 1
        : a.lastDate > b.lastDate
          ? -1
          : 0,
  );

  return suggestions.slice(0, maxSuggestions);
}
