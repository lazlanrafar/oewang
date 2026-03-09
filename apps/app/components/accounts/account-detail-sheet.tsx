"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Button,
  ScrollArea,
  Badge,
} from "@workspace/ui";
import type { Wallet } from "@workspace/types";
import { CheckCircle2, Pencil, XCircle } from "lucide-react";
import { formatCurrency } from "@workspace/utils";
import { useCurrency } from "@workspace/ui/hooks";

interface AccountDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet?: Wallet;
  onEdit: () => void;
}

export function AccountDetailSheet({
  open,
  onOpenChange,
  wallet,
  onEdit,
}: AccountDetailSheetProps) {
  const { settings } = useCurrency();
  if (!wallet) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="mb-0">
          <SheetTitle className="font-sans font-medium">
            Account Details
          </SheetTitle>
          <SheetDescription>
            Detailed information about your financial account.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-full p-0">
          <div className="space-y-8 py-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Account Name</p>
              <p className="text-xl font-sans">{wallet.name}</p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-3xl font-sans">
                {formatCurrency(Number(wallet.balance), settings)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge
                  variant={wallet.isIncludedInTotals ? "default" : "secondary"}
                  className="gap-1.5 font-normal"
                >
                  {wallet.isIncludedInTotals ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Included in Totals
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5" />
                      Excluded from Totals
                    </>
                  )}
                </Badge>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Created At</p>
                <p className="text-sm font-sans">
                  {new Date(wallet.createdAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="mt-8">
          <Button onClick={onEdit} className="w-full gap-2 font-sans">
            <Pencil className="h-4 w-4" />
            Edit Account
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
