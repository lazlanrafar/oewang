import { TrendingDown } from "lucide-react";

type Cat = { label: string; amount: string; pct: number };

const CATEGORIES: Cat[] = [
  { label: "Food & Drink", amount: "Rp 640.000", pct: 100 },
  { label: "Shopping", amount: "Rp 570.000", pct: 89 },
  { label: "Transport", amount: "Rp 320.000", pct: 50 },
  { label: "Subscriptions", amount: "Rp 186.000", pct: 29 },
  { label: "Utilities", amount: "Rp 180.000", pct: 28 },
];

// Rendered spending-insights panel (real data) — the "Understand" step.
export function InsightsPanel() {
  return (
    <div className="h-full w-full bg-[hsl(var(--background))] p-5 sm:p-6">
      <p className="font-serif text-foreground text-lg tracking-tight">This month</p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs">Total spent</p>
          <p className="mt-1 font-serif text-4xl text-foreground tracking-tight">Rp 2,14M</p>
        </div>
        <span className="flex items-center gap-1.5 bg-[hsl(var(--brand-accent))]/15 px-2.5 py-1 text-[hsl(var(--brand-accent))] text-xs">
          <TrendingDown className="size-3.5" />
          12% vs last month
        </span>
      </div>

      <div className="mt-6 space-y-3.5">
        {CATEGORIES.map((c) => (
          <div key={c.label}>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="text-foreground/90">{c.label}</span>
              <span className="text-muted-foreground">{c.amount}</span>
            </div>
            <div className="h-1.5 w-full bg-[hsl(var(--surface))]">
              <div
                className="h-full bg-[hsl(var(--brand-accent))]"
                style={{ width: `${c.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
