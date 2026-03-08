"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { TransactionForm } from "./transaction-form";
import type { Transaction } from "@workspace/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction;
  onSuccess?: () => void;
}

export function TransactionFormSheet({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[540px] overflow-y-auto p-0 flex flex-col h-full bg-background no-scrollbar">
        <SheetHeader className="px-6 pt-6 pb-4 shrink-0">
          <SheetTitle className="text-2xl font-sans tracking-tight">
            {transaction ? "Edit Transaction" : "New Transaction"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-20 no-scrollbar">
          <TransactionForm
            transactionId={transaction?.id}
            defaultValues={
              transaction
                ? {
                    amount: Number(transaction.amount),
                    date:
                      typeof transaction.date === "string"
                        ? transaction.date.slice(0, 10)
                        : new Date(transaction.date).toISOString().slice(0, 10),
                    type: transaction.type as "income" | "expense" | "transfer",
                    walletId: transaction.walletId ?? "",
                    toWalletId: transaction.toWalletId ?? "",
                    categoryId: transaction.categoryId ?? "",
                    name: (transaction as any).name ?? "",
                    description: transaction.description ?? "",
                  }
                : undefined
            }
            initialAttachments={
              transaction ? ((transaction as any).attachments ?? []) : []
            }
            onSuccess={() => {
              onOpenChange(false);
              onSuccess?.();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
