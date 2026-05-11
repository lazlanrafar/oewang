"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { bulkPayDebt, type DebtWithContact } from "@workspace/modules/client";
import { Badge, Button, Checkbox, cn, Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

import { SelectAccount } from "@/components/molecules/select-account";
import { useAppStore } from "@/stores/app";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debts: DebtWithContact[];
  contactName: string;
  dictionary: Dictionary;
}

export function BulkPaySheet({ open, onOpenChange, debts, contactName, dictionary }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { formatCurrency } = useAppStore();
  const dict = dictionary.debts;

  // Defensive date formatter
  const formatDate = (date: string | null | undefined) => {
    if (!date) return "–";
    try {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) return "–";
      return format(d, "MMM d, yyyy");
    } catch {
      return "–";
    }
  };

  // Only show outstanding debts
  const outstanding = debts.filter((d) => d.status !== "paid");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [walletId, setWalletId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Reset selection when sheet opens
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(outstanding.map((d) => d.id)));
      setWalletId("");
    }
  }, [open, outstanding.map]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === outstanding.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(outstanding.map((d) => d.id)));
    }
  };

  const selectedDebts = outstanding.filter((d) => selectedIds.has(d.id));

  const totalToPay = selectedDebts.reduce(
    (acc, d) => acc + (Number.parseFloat((d.remainingAmount ?? 0) as string) || 0),
    0,
  );

  const handleSubmit = async () => {
    if (!walletId) {
      toast.error(dict.bulk_settlement.select_account_toast);
      return;
    }
    if (selectedDebts.length === 0) {
      toast.error(dict.bulk_settlement.select_at_least_one_toast);
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        walletId,
        payments: selectedDebts.map((debt) => ({
          id: debt.id,
          amount: Number.parseFloat((debt.remainingAmount ?? 0) as string) || 0,
        })),
      };

      const result = await bulkPayDebt(payload);

      if (result.success) {
        toast.success(dict.bulk_settlement.success_toast);
        queryClient.invalidateQueries({ queryKey: ["debts"] });
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(result.error || dict.bulk_settlement.error_toast);
      }
    } catch {
      toast.error(dict.bulk_settlement.error_toast);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
        <SheetHeader className="shrink-0 border-b bg-muted/5 px-6 py-6 text-left">
          <SheetTitle className="font-normal font-serif text-xl">{dict.bulk_settlement.title}</SheetTitle>
          <p className="text-muted-foreground text-xs uppercase tracking-widest">{contactName || "Contact"}</p>
        </SheetHeader>

        <div className="no-scrollbar flex-1 overflow-y-auto">
          {outstanding.length === 0 ? (
            <div className="flex h-40 items-center justify-center px-6 text-muted-foreground text-sm">
              {dict.bulk_settlement.no_outstanding}
            </div>
          ) : (
            <>
              {/* Select all row */}
              <div className="flex items-center gap-3 border-b bg-muted/5 px-6 py-4">
                <Checkbox
                  checked={
                    selectedIds.size === outstanding.length ? true : selectedIds.size > 0 ? "indeterminate" : false
                  }
                  onCheckedChange={toggleAll}
                  id="select-all"
                />
                <label
                  htmlFor="select-all"
                  className="cursor-pointer font-medium text-[10px] text-muted-foreground uppercase tracking-widest"
                >
                  {dict.bulk_settlement.select_all} ({outstanding.length})
                </label>
              </div>

              {/* Debt list */}
              <div className="divide-y divide-border/50">
                {outstanding.map((debt) => {
                  const amount = Number.parseFloat((debt.amount ?? 0) as string) || 0;
                  const remaining = Number.parseFloat((debt.remainingAmount ?? 0) as string) || 0;
                  const isReceivable = debt.type === "receivable";
                  const isSelected = selectedIds.has(debt.id);

                  return (
                    <label
                      key={debt.id}
                      htmlFor={`debt-${debt.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-4 px-6 py-4 transition-colors",
                        isSelected ? "bg-muted/5" : "opacity-60",
                      )}
                    >
                      <Checkbox
                        id={`debt-${debt.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggle(debt.id)}
                        className="mt-0.5 shrink-0"
                      />

                      {/* Type icon */}
                      <div className={cn("mt-0.5 shrink-0", isReceivable ? "text-emerald-500" : "text-rose-500")}>
                        {isReceivable ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "font-medium text-[10px] uppercase tracking-widest",
                                isReceivable
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400",
                              )}
                            >
                              {isReceivable
                                ? dictionary.debts.types.you_are_owed || "Owed to you"
                                : dictionary.debts.types.you_owe || "You owe"}
                            </span>
                            <Badge
                              variant="outline"
                              className="h-4 rounded-none px-1.5 font-medium text-[9px] uppercase tracking-widest shadow-none"
                            >
                              {dict.statuses[debt.status] || debt.status}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{formatDate(debt.createdAt)}</span>
                        </div>

                        <p className="font-normal font-serif text-lg">{formatCurrency(remaining)}</p>
                        {remaining < amount && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground line-through opacity-60">
                            {dict.details.original_amount}: {formatCurrency(amount)}
                          </p>
                        )}
                        {debt.description && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground italic opacity-70">
                            {debt.description}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {outstanding.length > 0 && (
          <div className="shrink-0 space-y-4 border-t bg-background p-6">
            {/* Account selector */}
            <div className="space-y-2">
              <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dict.bulk_settlement.pay_from_account}
              </p>
              <SelectAccount value={walletId || undefined} onChange={setWalletId} />
            </div>

            {/* Total + submit */}
            <div className="flex items-center justify-between gap-4 border-border/50 border-t pt-2">
              <div>
                <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                  {dict.bulk_settlement.total_to_settle}
                </p>
                <p className="font-normal font-serif text-2xl">{formatCurrency(totalToPay)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedDebts.length}{" "}
                  {selectedDebts.length === 1 ? dict.columns.debt || "debt" : dict.title.toLowerCase() || "debts"}{" "}
                  selected
                </p>
              </div>
              <Button
                className="h-12 rounded-none px-8 font-medium text-xs uppercase tracking-widest"
                disabled={isLoading || selectedDebts.length === 0 || !walletId}
                onClick={handleSubmit}
              >
                {isLoading ? dict.bulk_settlement.settling : dict.bulk_settlement.settle_button}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
