"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Transaction } from "@workspace/types";
import {
  Landmark,
  Receipt,
  Loader2,
  MoreHorizontal,
  Trash,
  Edit,
  Copy,
  Check,
  FileCheck,
  ExternalLink,
} from "lucide-react";
import {
  cn,
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectAccount } from "@/components/molecules/select-account";
import { SelectUser } from "@/components/molecules/select-user";
import { format } from "date-fns";
import { formatCurrency as formatCurrencyUtil } from "@workspace/utils";
import { useAppStore } from "@/stores/app";
import { updateTransaction } from "@workspace/modules/transaction/transaction.action";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const transactionColumns = (
  onEdit: (transaction: Transaction) => void,
): ColumnDef<Transaction>[] => [
  {
    id: "select",
    header: ({ table }) => {
      const meta = table.options.meta as any;
      const isAllSelected = meta?.isAllTransactionsSelected
        ? meta.isAllTransactionsSelected()
        : table.getIsAllPageRowsSelected();
      const isSomeSelected = meta?.isSomeTransactionsSelected
        ? meta.isSomeTransactionsSelected()
        : table.getIsSomePageRowsSelected();

      return (
        <Checkbox
          checked={isAllSelected || (isSomeSelected && "indeterminate")}
          onCheckedChange={(value) => {
            if (meta?.toggleAllTransactions) {
              meta.toggleAllTransactions(!!value);
            } else {
              table.toggleAllPageRowsSelected(!!value);
            }
          }}
          aria-label="Select all"
        />
      );
    },
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
    size: 50,
    meta: {
      sticky: true,
      className: "bg-background z-10",
      skeleton: {
        type: "checkbox",
        width: "w-5",
      },
    },
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => {
      const date = row.getValue("date") as string;

      if (!date || isNaN(new Date(date).getTime())) {
        return (
          <p className="text-xs font-sans text-muted-foreground whitespace-nowrap">
            -
          </p>
        );
      }

      return (
        <p className="text-xs font-sans text-muted-foreground whitespace-nowrap">
          {format(new Date(date), "dd/MM/yyyy")}
        </p>
      );
    },
    enableResizing: false,
    size: 110,
    meta: {
      sticky: true,
      className: "bg-background z-10",
      skeleton: {
        type: "text",
        width: "w-20",
      },
    },
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
    meta: {
      sticky: true,
      className: "bg-background z-10",
      skeleton: {
        type: "icon-text",
        width: "w-40",
      },
    },
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row, table }) => {
      const amount = Number(row.getValue("amount"));
      const transaction = row.original;
      const isExpense = transaction.type === "expense";
      const isIncome = transaction.type === "income";

      const { getTransactionColor, formatCurrency } = useAppStore.getState();

      return (
        <div
          className={cn(
            "text-xs font-medium text-right",
            getTransactionColor(transaction.type),
          )}
        >
          {formatCurrency(amount)}
        </div>
      );
    },
    size: 170,
    minSize: 100,
    maxSize: 400,
    meta: {
      skeleton: {
        type: "text",
        width: "w-24",
      },
    },
  },
  {
    id: "account",
    accessorKey: "wallet.name",
    header: "Account",
    cell: ({ row, table }) => (
      <AccountCell transaction={row.original} table={table} />
    ),
    size: 200,
    minSize: 120,
    maxSize: 300,
    meta: {
      skeleton: {
        type: "text",
        width: "w-32",
      },
    },
  },
  {
    id: "category",
    accessorKey: "category.name",
    header: "Category",
    cell: ({ row, table }) => (
      <CategoryCell transaction={row.original} table={table} />
    ),
    size: 250,
    minSize: 150,
    maxSize: 400,
    meta: {
      skeleton: {
        type: "text",
        width: "w-40",
      },
    },
  },
  {
    id: "assignee",
    accessorKey: "user.name",
    header: "Assignee",
    cell: ({ row, table }) => (
      <UserCell transaction={row.original} table={table} />
    ),
    size: 200,
    minSize: 120,
    maxSize: 300,
    meta: {
      skeleton: {
        type: "text",
        width: "w-28",
      },
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const transaction = row.original;
      const meta = table.options.meta as any;
      const queryClient = useQueryClient();

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-transparent"
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 font-sans">
            <DropdownMenuItem
              onClick={() => meta?.onRowClick?.(transaction)}
              className="gap-2 cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onEdit(transaction)}
              className="gap-2 cursor-pointer"
            >
              <Edit className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?transactionId=${transaction.id}`;
                navigator.clipboard.writeText(url);
                toast.success("Link copied to clipboard");
              }}
              className="gap-2 cursor-pointer"
            >
              <Copy className="h-4 w-4" />
              Copy link
            </DropdownMenuItem>

            <div className="h-px bg-muted my-1" />

            <DropdownMenuItem
              onClick={async () => {
                const res = await updateTransaction(transaction.id, {
                  isReady: !transaction.isReady,
                });
                if (res.success) {
                  toast.success(
                    transaction.isReady
                      ? "Marked as pending"
                      : "Marked as ready",
                  );
                  queryClient.invalidateQueries({ queryKey: ["transactions"] });
                }
              }}
              className="gap-2 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              {transaction.isReady ? "Reset status" : "Mark ready"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const res = await updateTransaction(transaction.id, {
                  isExported: !transaction.isExported,
                });
                if (res.success) {
                  toast.success(
                    transaction.isExported
                      ? "Unmarked as exported"
                      : "Marked as exported",
                  );
                  queryClient.invalidateQueries({ queryKey: ["transactions"] });
                }
              }}
              className="gap-2 cursor-pointer"
            >
              <FileCheck className="h-4 w-4" />
              {transaction.isExported ? "Reset export" : "Mark exported"}
            </DropdownMenuItem>

            <div className="h-px bg-muted my-1" />

            <DropdownMenuItem
              onClick={() => meta?.onDelete?.(transaction.id)}
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    enableHiding: false,
    size: 100,
    meta: {
      sticky: true,
      className: "bg-background z-10",
      skeleton: {
        type: "text",
        width: "w-10",
      },
    },
  },
];

function CategoryCell({
  transaction,
  table,
}: {
  transaction: Transaction;
  table: any;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const meta = table.options.meta as any;

  const handleCategoryChange = async (categoryId: string) => {
    if (categoryId === transaction.categoryId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction.id, {
      categoryId,
    });

    if (res.success) {
      toast.success("Category updated");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
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
            value={transaction.categoryId ?? undefined}
            type={transaction.type as "income" | "expense"}
            onChange={handleCategoryChange}
            disabled={updating}
            variant="ghost"
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

function AccountCell({
  transaction,
  table,
}: {
  transaction: Transaction;
  table: any;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const meta = table.options.meta as any;

  const handleAccountChange = async (walletId: string) => {
    if (walletId === transaction.walletId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction.id, {
      walletId,
    });

    if (res.success) {
      toast.success("Account updated");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update account");
    }
    setUpdating(false);
  };

  return (
    <div className="relative group w-full h-full flex items-center">
      <SelectAccount
        value={transaction.walletId}
        onChange={handleAccountChange}
        disabled={updating}
        variant="ghost"
        className="w-full justify-start px-3 h-full rounded-none border-none hover:bg-transparent focus-visible:ring-0"
      />
      {updating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

function UserCell({ transaction }: { transaction: Transaction; table: any }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const handleUserChange = async (userId: string) => {
    if (userId === transaction.assignedUserId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction.id, {
      assignedUserId: userId,
    });

    if (res.success) {
      toast.success("Assignee updated");
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      router.refresh();
    } else {
      toast.error(res.error || "Failed to update assignee");
    }
    setUpdating(false);
  };

  return (
    <div className="relative group w-full h-full flex items-center">
      <SelectUser
        value={transaction.assignedUserId ?? undefined}
        onChange={handleUserChange}
        disabled={updating}
        variant="ghost"
        className="w-full justify-start px-3 h-full rounded-none border-none hover:bg-transparent focus-visible:ring-0"
      />
      {updating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
