"use client";

import { useState } from "react";
import type { Wallet } from "@workspace/types";
import { type DebtWithContact, payDebt } from "@workspace/modules/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Badge,
  Alert,
  AlertDescription,
  Separator,
} from "@workspace/ui";
import { useAppStore } from "@/stores/app";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Calendar, Trash, Wallet as WalletIcon, CreditCard } from "lucide-react";
import { formatCurrency } from "@workspace/utils";
import { format } from "date-fns";
import { PaymentFormSheet } from "./payment-form-sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: DebtWithContact;
  wallets: Wallet[];
  onDelete: (id: string) => void;
}

export function DebtDetailSheet({ open, onOpenChange, debt, wallets, onDelete }: Props) {
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const { settings } = useAppStore();

  if (!debt) return null;

  const isReceivable = debt.type === "receivable";
  const amount = Number.parseFloat(debt.amount as string);
  const remainingAmount = Number.parseFloat(debt.remainingAmount as string);
  const paidAmount = amount - remainingAmount;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex flex-col h-full p-0 rounded-none shadow-none border-l sm:max-w-[540px]">
          <SheetHeader className="px-6 py-6 border-b shrink-0 flex flex-row items-center justify-between bg-muted/5 text-left">
            <SheetTitle className="font-serif text-xl font-normal">Debt Details</SheetTitle>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  onDelete(debt.id);
                  onOpenChange(false);
                }}
              >
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 no-scrollbar relative space-y-8">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-4xl font-serif tracking-tight font-normal">
                  {formatCurrency(remainingAmount, settings)}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {isReceivable ? (
                    <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-rose-500" />
                  )}
                  <span className="text-[10px] font-medium uppercase tracking-widest">
                    {isReceivable ? "You are owed by" : "You owe"}
                  </span>
                  <span className="text-[10px] font-medium uppercase tracking-widest text-foreground">
                    {debt.contactName}
                  </span>
                </div>
              </div>

              <Badge
                variant={
                  debt.status === "paid"
                    ? "default"
                    : debt.status === "partial"
                      ? "secondary"
                      : "outline"
                }
                className="capitalize rounded-none shadow-none text-[10px] font-medium tracking-widest"
              >
                {debt.status}
              </Badge>
            </div>

            <Separator />

            <div className="space-y-6">
              <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Summary</h3>
              
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Original Amount</p>
                  <p className="font-serif text-lg font-normal">{formatCurrency(amount, settings)}</p>
                </div>
                
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Paid Amount</p>
                  <p className="font-serif text-lg font-normal text-emerald-500">{formatCurrency(paidAmount, settings)}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Due Date
                  </p>
                  <p className="font-serif text-lg font-normal">
                    {debt.dueDate ? format(new Date(debt.dueDate), "MMM d, yyyy") : "No due date"}
                  </p>
                </div>

                {debt.sourceTransactionName && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      From Transaction
                    </p>
                    <p className="font-serif text-lg hover:underline cursor-pointer line-clamp-1 italic text-muted-foreground font-normal">
                      {debt.sourceTransactionName}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {debt.description && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Notes</h3>
                <div className="text-sm text-foreground/80 whitespace-pre-wrap rounded-none bg-muted/10 p-4 border border-border/50 italic font-normal">
                  {debt.description}
                </div>
              </div>
            )}
          </div>

          <div className="p-6 border-t bg-background shrink-0 mt-auto">
            <Button
              className="w-full rounded-none h-12 uppercase tracking-widest font-medium text-xs"
              disabled={debt.status === "paid"}
              onClick={() => setPaymentFormOpen(true)}
            >
              {debt.status === "paid" ? "Settled" : "Record Payment"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <PaymentFormSheet
        open={paymentFormOpen}
        onOpenChange={setPaymentFormOpen}
        debt={debt}
        wallets={wallets}
      />
    </>
  );
}
