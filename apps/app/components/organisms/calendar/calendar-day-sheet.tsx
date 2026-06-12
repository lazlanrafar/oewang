"use client";

import type { Dictionary } from "@workspace/dictionaries";
import type { Debt, Transaction } from "@workspace/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { format } from "date-fns";

import { useAppStore } from "@/stores/app";

interface CalendarDaySheetProps {
  date: Date | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  debts: (Debt & { contactName: string })[];
  dictionary: Dictionary;
  onTransactionClick: (transaction: Transaction) => void;
}

export function CalendarDaySheet({
  date,
  open,
  onOpenChange,
  transactions,
  debts,
  dictionary,
  onTransactionClick,
}: CalendarDaySheetProps) {
  const formatCurrency = useAppStore((s) => s.formatCurrency);
  const getTransactionColor = useAppStore((s) => s.getTransactionColor);

  if (!dictionary) return null;
  const t = dictionary.calendar.sheet;

  if (!date) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0">
        <div className="flex h-full flex-col bg-background">
          <SheetHeader className="sticky top-0 z-10 flex flex-row items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur transition-all">
            <SheetTitle>{format(date, "EEEE, MMMM do, yyyy")}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-8 overflow-y-auto px-6 py-8">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border bg-muted/20 p-4">
                <p className="mb-1 text-muted-foreground text-sm">{t.income_total}</p>
                <p className="font-semibold text-emerald-600 text-lg dark:text-emerald-400">
                  {formatCurrency(
                    transactions.filter((t) => t.type === "income").reduce((acc, t) => acc + Number(t.amount), 0),
                  )}
                </p>
              </div>
              <div className="border bg-muted/20 p-4">
                <p className="mb-1 text-muted-foreground text-sm">{t.expense_total}</p>
                <p className="font-semibold text-lg text-red-600 dark:text-red-400">
                  {formatCurrency(
                    transactions.filter((t) => t.type === "expense").reduce((acc, t) => acc + Number(t.amount), 0),
                  )}
                </p>
              </div>
            </div>

            {/* Transactions List */}
            <div>
              <h3 className="mb-4 text-sm tracking-wider">
                {t.transactions_title.replace("{count}", transactions.length.toString())}
              </h3>
              {transactions.length > 0 ? (
                <div className="space-y-4">
                  {transactions.map((tx) => {
                    return (
                      <button
                        type="button"
                        key={tx.id}
                        onClick={() => onTransactionClick(tx)}
                        className="group flex w-full cursor-pointer flex-col gap-1 border p-3 text-left transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-medium text-sm transition-colors group-hover:text-primary">
                            {tx.name || t.unknown_transaction}
                          </span>
                          <span className={`font-serif tracking-tight ${getTransactionColor(tx.type)}`}>
                            {tx.type === "income" ? "+" : "-"}
                            {formatCurrency(Number(tx.amount))}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-muted/20 p-4 text-center text-muted-foreground text-sm">{t.no_transactions}</div>
              )}
            </div>

            {/* Debts List */}
            <div>
              <h3 className="mb-4 text-sm tracking-wider">
                {t.debts_title.replace("{count}", debts.length.toString())}
              </h3>
              {debts.length > 0 ? (
                <div className="space-y-3">
                  {debts.map((d) => (
                    <div key={d.id} className="flex flex-col gap-1 border bg-card p-3">
                      <div className="flex items-start justify-between">
                        <span className="font-medium">{d.contactName}</span>
                        <span className="font-medium">{formatCurrency(Number(d.amount))}</span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground text-xs">
                        <span className="capitalize">{d.type}</span>
                        <span
                          className={`rounded-sm px-1.5 py-0.5 capitalize ${
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
                        <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">{d.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-muted/20 p-4 text-center text-muted-foreground text-sm">{t.no_debts}</div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
