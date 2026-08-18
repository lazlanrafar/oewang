import { Check, Search } from "lucide-react";

type Txn = {
  date: string;
  merchant: string;
  category: string;
  amount: string;
  type: "in" | "out";
  checked: boolean;
};

const TXNS: Txn[] = [
  { date: "19 Jun", merchant: "Kopi Kenangan", category: "Food & Drink", amount: "-Rp 45.000", type: "out", checked: true },
  { date: "18 Jun", merchant: "Gojek", category: "Transport", amount: "-Rp 32.000", type: "out", checked: true },
  { date: "17 Jun", merchant: "Tokopedia", category: "Shopping", amount: "-Rp 250.000", type: "out", checked: true },
  { date: "16 Jun", merchant: "PLN", category: "Utilities", amount: "-Rp 180.000", type: "out", checked: true },
  { date: "15 Jun", merchant: "Salary", category: "Income", amount: "+Rp 12.000.000", type: "in", checked: true },
  { date: "14 Jun", merchant: "Netflix", category: "Subscriptions", amount: "-Rp 186.000", type: "out", checked: true },
  { date: "13 Jun", merchant: "Indomaret", category: "Groceries", amount: "-Rp 67.500", type: "out", checked: false },
];

function Box({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex size-4 items-center justify-center border ${
        checked
          ? "border-[hsl(var(--brand-accent))] bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-accent-foreground))]"
          : "border-border"
      }`}
    >
      {checked && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}

// Rendered transactions table (real data, not a skeleton).
export function TransactionsTable() {
  return (
    <div className="h-full w-full bg-[hsl(var(--background))] p-5 sm:p-6">
      <p className="font-serif text-foreground text-lg tracking-tight">Transactions</p>

      {/* Search + tabs */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 border border-border bg-[hsl(var(--card))] px-3 py-2 text-muted-foreground text-xs">
          <Search className="size-3.5" />
          <span>Search transactions…</span>
        </div>
        <div className="flex items-center border border-border text-xs">
          <span className="bg-[hsl(var(--surface))] px-3 py-2 text-foreground">All</span>
          <span className="px-3 py-2 text-muted-foreground">Uncategorized (3)</span>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 border border-border">
        <div className="grid grid-cols-[24px_64px_1fr_112px_112px] items-center gap-2 border-border/70 border-b bg-[hsl(var(--card))] px-3 py-2.5 text-[11px] text-muted-foreground uppercase tracking-wider">
          <span />
          <span>Date</span>
          <span>Description</span>
          <span>Category</span>
          <span className="text-right">Amount</span>
        </div>
        {TXNS.map((t) => (
          <div
            key={t.merchant}
            className="grid grid-cols-[24px_64px_1fr_112px_112px] items-center gap-2 border-border/50 border-b px-3 py-2.5 text-[13px] last:border-b-0"
          >
            <Box checked={t.checked} />
            <span className="text-muted-foreground">{t.date}</span>
            <span className="truncate text-foreground">{t.merchant}</span>
            <span>
              <span
                className={`inline-block px-2 py-0.5 text-[11px] ${
                  t.type === "in"
                    ? "bg-[hsl(var(--brand-accent))]/15 text-[hsl(var(--brand-accent))]"
                    : "bg-[hsl(var(--surface))] text-muted-foreground"
                }`}
              >
                {t.category}
              </span>
            </span>
            <span
              className={`text-right font-medium ${
                t.type === "in" ? "text-[hsl(var(--brand-accent))]" : "text-foreground"
              }`}
            >
              {t.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
