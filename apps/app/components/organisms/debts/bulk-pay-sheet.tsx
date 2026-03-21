"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Button,
  Checkbox,
  Badge,
  cn,
} from "@workspace/ui";
import { type DebtWithContact, bulkPayDebt } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/stores/app";
import { formatCurrency } from "@workspace/utils";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { SelectAccount } from "@/components/molecules/select-account";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debts: DebtWithContact[];
  contactName: string;
}

export function BulkPaySheet({ open, onOpenChange, debts, contactName }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { settings } = useAppStore();

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
  }, [open]);

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
    (acc, d) => acc + Number.parseFloat(d.remainingAmount as string),
    0
  );

  const handleSubmit = async () => {
    if (!walletId) {
      toast.error("Please select an account");
      return;
    }
    if (selectedDebts.length === 0) {
      toast.error("Please select at least one debt");
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        walletId,
        payments: selectedDebts.map((debt) => ({
          id: debt.id,
          amount: Number.parseFloat(debt.remainingAmount as string),
        })),
      };

      const result = await bulkPayDebt(payload);

      if (result.success) {
        toast.success(`Successfully settled ${selectedDebts.length} debt${selectedDebts.length > 1 ? "s" : ""}`);
        queryClient.invalidateQueries({ queryKey: ["debts"] });
        queryClient.invalidateQueries({ queryKey: ["wallets"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(result.error || "Failed to settle debts. Please try again.");
      }
    } catch {
      toast.error("Unexpected error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col h-full p-0 rounded-none shadow-none border-l sm:max-w-[540px]">
        <SheetHeader className="px-6 py-6 border-b shrink-0 bg-muted/5 text-left">
          <SheetTitle className="font-serif text-xl font-normal">Bulk Settlement</SheetTitle>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            {contactName}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {outstanding.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground px-6">
              No outstanding debts for this contact.
            </div>
          ) : (
            <>
              {/* Select all row */}
              <div className="px-6 py-4 border-b flex items-center gap-3 bg-muted/5">
                <Checkbox
                  checked={
                    selectedIds.size === outstanding.length
                      ? true
                      : selectedIds.size > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={toggleAll}
                  id="select-all"
                />
                <label
                  htmlFor="select-all"
                  className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground cursor-pointer"
                >
                  Select all ({outstanding.length})
                </label>
              </div>

              {/* Debt list */}
              <div className="divide-y divide-border/50">
                {outstanding.map((debt) => {
                  const amount = Number.parseFloat(debt.amount as string);
                  const remaining = Number.parseFloat(debt.remainingAmount as string);
                  const isReceivable = debt.type === "receivable";
                  const isSelected = selectedIds.has(debt.id);

                  return (
                    <div
                      key={debt.id}
                      className={cn(
                        "px-6 py-4 flex items-start gap-4 transition-colors cursor-pointer",
                        isSelected ? "bg-muted/5" : "opacity-60"
                      )}
                      onClick={() => toggle(debt.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(debt.id)}
                        className="mt-0.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />

                      {/* Type icon */}
                      <div
                        className={cn(
                          "mt-0.5 shrink-0",
                          isReceivable ? "text-emerald-500" : "text-rose-500"
                        )}
                      >
                        {isReceivable ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-[10px] font-medium uppercase tracking-widest",
                                isReceivable
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              )}
                            >
                              {isReceivable ? "Owed to you" : "You owe"}
                            </span>
                            <Badge
                              variant="outline"
                              className="h-4 px-1.5 text-[9px] uppercase font-medium tracking-widest rounded-none shadow-none"
                            >
                              {debt.status}
                            </Badge>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(debt.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>

                        <p className="text-lg font-serif font-normal">
                          {formatCurrency(remaining, settings)}
                        </p>
                        {remaining < amount && (
                          <p className="text-[10px] text-muted-foreground line-through opacity-60 mt-0.5">
                            Original: {formatCurrency(amount, settings)}
                          </p>
                        )}
                        {debt.description && (
                          <p className="text-[11px] text-muted-foreground italic opacity-70 truncate mt-0.5">
                            {debt.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {outstanding.length > 0 && (
          <div className="p-6 border-t bg-background shrink-0 space-y-4">
            {/* Account selector */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Pay from account
              </p>
              <SelectAccount
                value={walletId || undefined}
                onChange={setWalletId}
              />
            </div>

            {/* Total + submit */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/50">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  Total to settle
                </p>
                <p className="text-2xl font-serif font-normal">
                  {formatCurrency(totalToPay, settings)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedDebts.length} debt{selectedDebts.length !== 1 ? "s" : ""} selected
                </p>
              </div>
              <Button
                className="rounded-none h-12 px-8 uppercase tracking-widest font-medium text-xs"
                disabled={isLoading || selectedDebts.length === 0 || !walletId}
                onClick={handleSubmit}
              >
                {isLoading ? "Settling…" : "Settle All"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
