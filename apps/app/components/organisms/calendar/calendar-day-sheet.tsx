"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { useRouter } from "next/navigation";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Transaction, Debt } from "@workspace/types";
import { useAppStore } from "@/stores/app";

interface CalendarDaySheetProps {
  date: Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  debts: (Debt & { contactName: string })[];
}

export function CalendarDaySheet({
  date,
  open,
  onOpenChange,
  transactions,
  debts,
}: CalendarDaySheetProps) {
  const router = useRouter();
  const { formatCurrency, getTransactionColor } = useAppStore();

  const handleTransactionClick = (id: string) => {
    onOpenChange(false);
    const start = startOfMonth(date || new Date()).toISOString();
    const end = endOfMonth(date || new Date()).toISOString();
    router.push(
      `/transactions?transactionId=${id}&startDate=${start}&endDate=${end}&page=1`,
    );
  };

  if (!date) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <div className="flex flex-col h-full bg-background">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background/95 backdrop-blur z-10 flex flex-row items-center justify-between transition-all">
            <SheetTitle>{format(date, "EEEE, MMMM do, yyyy")}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border bg-muted/20">
                <p className="text-sm text-muted-foreground mb-1">
                  Total Income
                </p>
                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.type === "income")
                      .reduce((acc, t) => acc + Number(t.amount), 0),
                  )}
                </p>
              </div>
              <div className="p-4 border bg-muted/20">
                <p className="text-sm text-muted-foreground mb-1">
                  Total Expense
                </p>
                <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(
                    transactions
                      .filter((t) => t.type === "expense")
                      .reduce((acc, t) => acc + Number(t.amount), 0),
                  )}
                </p>
              </div>
            </div>

            {/* Transactions List */}
            <div>
              <h3 className="text-sm tracking-wider mb-4">
                Transactions ({transactions.length})
              </h3>
              {transactions.length > 0 ? (
                <div className="space-y-4">
                  {transactions.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => handleTransactionClick(t.id)}
                      className="p-3 border flex flex-col gap-1 cursor-pointer hover:bg-muted/30 transition-colors group"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-sm group-hover:text-primary transition-colors">
                          {t.name || "Unknown"}
                        </span>
                        <span
                          className={`font-serif tracking-tight ${getTransactionColor(t.type)}`}
                        >
                          {t.type === "income" ? "+" : "-"}
                          {formatCurrency(Number(t.amount))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground p-4 bg-muted/20  text-center">
                  No transactions for this day.
                </div>
              )}
            </div>

            {/* Debts List */}
            <div>
              <h3 className="text-sm tracking-wider mb-4">
                Debts Required/Incurred ({debts.length})
              </h3>
              {debts.length > 0 ? (
                <div className="space-y-3">
                  {debts.map((d) => (
                    <div
                      key={d.id}
                      className="p-3 border  bg-card flex flex-col gap-1"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-medium">{d.contactName}</span>
                        <span className="font-medium">
                          {formatCurrency(Number(d.amount))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span className="capitalize">{d.type}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-sm capitalize ${
                            d.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : d.status === "partial"
                                ? "bg-amber-500/10 text-amber-600"
                                : "bg-red-500/10 text-red-600"
                          }`}
                        >
                          {d.status}
                        </span>
                      </div>
                      {d.description && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {d.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground p-4 bg-muted/20  text-center">
                  No debts recorded or due on this day.
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
