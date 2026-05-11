"use client";

import { useState } from "react";

import type { Dictionary } from "@workspace/dictionaries";
import type { DebtWithContact } from "@workspace/modules/client";
import type { TransactionSettings, Wallet } from "@workspace/types";
import { Badge, Button, Separator, Sheet, SheetContent, SheetHeader, SheetTitle } from "@workspace/ui";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Calendar, CreditCard, Trash } from "lucide-react";

import { PaymentFormSheet } from "./payment-form-sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt?: DebtWithContact;
  wallets: Wallet[];
  onDelete: (id: string) => void;
  dictionary: Dictionary;
  settings: TransactionSettings;
}

export function DebtDetailSheet({ open, onOpenChange, debt, wallets, onDelete, dictionary, settings }: Props) {
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const dict = dictionary.debts;

  const formatCurrency = (amount: number, options?: Parameters<typeof formatCurrencyUtil>[2]) =>
    formatCurrencyUtil(amount, settings, options);

  if (!debt) return null;

  const isReceivable = debt.type === "receivable";
  const amount = Number.parseFloat(debt.amount as string);
  const remainingAmount = Number.parseFloat(debt.remainingAmount as string);
  const paidAmount = amount - remainingAmount;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
          <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b bg-muted/5 px-6 py-6 text-left">
            <SheetTitle className="font-normal font-serif text-xl">{dict.details.title}</SheetTitle>
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
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </SheetHeader>

          <div className="no-scrollbar relative flex-1 space-y-8 overflow-y-auto px-6 py-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="font-normal font-serif text-4xl tracking-tight">{formatCurrency(remainingAmount)}</p>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  {isReceivable ? (
                    <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-rose-500" />
                  )}
                  <span className="font-medium text-[10px] uppercase tracking-widest">
                    {isReceivable ? dict.types.you_are_owed : dict.types.you_owe}
                  </span>
                  <span className="font-medium text-[10px] text-foreground uppercase tracking-widest">
                    {debt.contactName}
                  </span>
                </div>
              </div>

              <Badge
                variant={debt.status === "paid" ? "default" : debt.status === "partial" ? "secondary" : "outline"}
                className="rounded-none font-medium text-[10px] capitalize tracking-widest shadow-none"
              >
                {dict.statuses[debt.status] || debt.status}
              </Badge>
            </div>

            <Separator />

            <div className="space-y-6">
              <h3 className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                {dict.details.summary}
              </h3>

              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div className="space-y-1">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dict.details.original_amount}
                  </p>
                  <p className="font-normal font-serif text-lg">{formatCurrency(amount)}</p>
                </div>

                <div className="space-y-1">
                  <p className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    {dict.details.paid_amount}
                  </p>
                  <p className="font-normal font-serif text-emerald-500 text-lg">{formatCurrency(paidAmount)}</p>
                </div>

                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                    <Calendar className="h-3.5 w-3.5" />
                    {dict.details.due_date}
                  </p>
                  <p className="font-normal font-serif text-lg">
                    {debt.dueDate ? format(new Date(debt.dueDate), "MMM d, yyyy") : dict.details.no_due_date}
                  </p>
                </div>

                {debt.sourceTransactionName && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                      <CreditCard className="h-3.5 w-3.5" />
                      {dict.details.from_transaction}
                    </p>
                    <p className="line-clamp-1 cursor-pointer font-normal font-serif text-lg text-muted-foreground italic hover:underline">
                      {debt.sourceTransactionName}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {debt.description && (
              <div className="space-y-2">
                <h3 className="font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
                  {dict.details.notes}
                </h3>
                <div className="whitespace-pre-wrap rounded-none border border-border/50 bg-muted/10 p-4 font-normal text-foreground/80 text-sm italic">
                  {debt.description}
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto shrink-0 border-t bg-background p-6">
            <Button
              className="h-12 w-full rounded-none font-medium text-xs uppercase tracking-widest"
              disabled={debt.status === "paid"}
              onClick={() => setPaymentFormOpen(true)}
            >
              {debt.status === "paid" ? dict.details.settled : dict.details.record_payment}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <PaymentFormSheet
        open={paymentFormOpen}
        onOpenChange={setPaymentFormOpen}
        debt={debt}
        wallets={wallets}
        dictionary={dictionary}
        settings={settings}
      />
    </>
  );
}
