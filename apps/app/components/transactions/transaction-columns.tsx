"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Transaction } from "@workspace/types";
import {
  Badge,
  cn,
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { format } from "date-fns";
import { formatCurrency } from "@workspace/utils";
import { Landmark, Receipt, Loader2 } from "lucide-react";
import { SelectCategory } from "../shared/select-category";
import { updateTransaction } from "@workspace/modules/transaction/transaction.action";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";

export const transactionColumns = (
  onEdit: (transaction: Transaction) => void,
): ColumnDef<Transaction>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 40,
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => {
      const date = row.getValue("date") as string;
      return (
        <p className="text-xs font-sans text-muted-foreground whitespace-nowrap">
          {format(new Date(date), "dd/MM/yyyy")}
        </p>
      );
    },
    enableResizing: false,
    size: 110,
  },
  {
    accessorKey: "name",
    header: "Description",
    cell: ({ row }) => {
      const transaction = row.original;
      const isIncome = transaction.type === "income";
      const isTransfer = transaction.type === "transfer";
      const isExpense = transaction.type === "expense";

      const label =
        transaction.name ||
        (isTransfer
          ? "Transfer"
          : transaction.type === "transfer-in"
            ? "Transfer-In"
            : transaction.type === "transfer-out"
              ? "Transfer-Out"
              : (transaction.category?.name ?? "Transaction"));
      const Icon = transaction.name ? Landmark : Receipt;

      return (
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 min-w-0 font-sans cursor-default">
                <Icon
                  className={cn(
                    "h-3 w-3 shrink-0",
                    isIncome
                      ? "text-emerald-500"
                      : isExpense
                        ? "text-red-500"
                        : "text-blue-500",
                  )}
                />
                <p
                  className={cn(
                    "text-xs font-medium truncate",
                    isIncome
                      ? "text-emerald-500"
                      : isExpense
                        ? "text-red-500"
                        : isTransfer
                          ? "text-blue-500"
                          : transaction.type === "transfer-in"
                            ? "text-emerald-500"
                            : "text-red-500",
                  )}
                >
                  {label}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              className="text-[11px] px-2 py-1 max-w-[300px] wrap-break-word"
            >
              {label}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
    size: 320,
    minSize: 200,
    maxSize: 600,
  },
  {
    id: "tax_amount",
    header: "Tax Amount",
    cell: () => <span className="text-xs text-muted-foreground">-</span>,
    size: 170,
    minSize: 100,
    maxSize: 400,
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row, table }) => {
      const amount = Number(row.getValue("amount"));
      const transaction = row.original;
      const isExpense = transaction.type === "expense";
      const isIncome = transaction.type === "income";

      const meta = table.options.meta as any;
      const settings = meta?.settings;

      return (
        <div
          className={cn(
            "text-xs font-medium text-right",
            isExpense && "text-red-500",
            isIncome && "text-emerald-500",
            transaction.type === "transfer" && "text-blue-500",
          )}
        >
          {formatCurrency(amount, settings)}
        </div>
      );
    },
    size: 170,
    minSize: 100,
    maxSize: 400,
  },
  {
    id: "category",
    accessorKey: "category.name",
    header: "Category",
    cell: ({ row }) => <CategoryCell transaction={row.original} />,
    size: 250,
    minSize: 150,
    maxSize: 400,
  },
];

function CategoryCell({ transaction }: { transaction: Transaction }) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  const handleCategoryChange = async (categoryId: string) => {
    if (categoryId === transaction.categoryId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction.id, {
      categoryId,
    });

    if (res.success) {
      toast.success("Category updated");
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update category");
    }
    setUpdating(false);
  };

  const canHaveCategory =
    transaction.type === "income" || transaction.type === "expense";

  return (
    <div className="relative group w-full h-full flex items-center">
      {canHaveCategory ? (
        <>
          <SelectCategory
            selectedCategoryId={transaction.categoryId ?? undefined}
            selectedCategoryName={transaction.category?.name ?? undefined}
            type={transaction.type as "income" | "expense"}
            onChange={handleCategoryChange}
            disabled={updating}
            className="w-full justify-start px-3 h-full rounded-none border-none hover:bg-transparent focus-visible:ring-0"
          />
          {updating && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            </div>
          )}
        </>
      ) : (
        <span className="text-xs text-muted-foreground ml-3">-</span>
      )}
    </div>
  );
}
