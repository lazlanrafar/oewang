"use client";

import { Transaction } from "@workspace/types";
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
} from "lucide-react";
import { cn } from "@workspace/ui";
import { useCurrency } from "@/hooks/use-currency";
import { Badge } from "@workspace/ui";

interface TransactionItemProps {
  transaction: Transaction;
  onClick: () => void;
}

export function TransactionItem({
  transaction,
  onClick,
}: TransactionItemProps) {
  const { formatAmount } = useCurrency();

  const isExpense = transaction.type === "expense";
  const isIncome = transaction.type === "income";
  const isTransfer = transaction.type === "transfer";

  const Icon = isTransfer
    ? ArrowRightLeft
    : isIncome
      ? ArrowDownLeft
      : ArrowUpRight;

  const label =
    transaction.description ||
    (isTransfer
      ? `Transfer → ${transaction.toWallet?.name ?? "Unknown"}`
      : (transaction.category?.name ?? "Uncategorized"));

  const subtitle = isTransfer
    ? `${transaction.wallet?.name} → ${transaction.toWallet?.name}`
    : (transaction.wallet?.name ?? "");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-6 py-3 border-b last:border-b-0 hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer group"
    >
      {/* Description */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "shrink-0 p-1.5 rounded-full",
            isExpense && "bg-red-100 text-red-600 dark:bg-red-900/20",
            isIncome && "bg-green-100 text-green-600 dark:bg-green-900/20",
            isTransfer && "bg-blue-100 text-blue-600 dark:bg-blue-900/20",
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {transaction.note && (
            <p className="text-xs text-muted-foreground truncate">
              {transaction.note}
            </p>
          )}
        </div>
      </div>

      {/* Category / Wallet */}
      <div className="text-sm text-muted-foreground truncate pr-4">
        {subtitle}
      </div>

      {/* Type Badge */}
      <div>
        <Badge
          variant="outline"
          className={cn(
            "text-xs capitalize font-normal",
            isExpense &&
              "border-red-200 text-red-600 dark:border-red-800 dark:text-red-400",
            isIncome &&
              "border-green-200 text-green-600 dark:border-green-800 dark:text-green-400",
            isTransfer &&
              "border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400",
          )}
        >
          {transaction.type}
        </Badge>
      </div>

      {/* Amount */}
      <div
        className={cn(
          "text-sm font-semibold text-right",
          isExpense && "text-red-600 dark:text-red-400",
          isIncome && "text-green-600 dark:text-green-400",
          isTransfer && "text-blue-600 dark:text-blue-400",
        )}
      >
        {isExpense ? "−" : "+"}
        {formatAmount(Number(transaction.amount))}
      </div>
    </div>
  );
}
