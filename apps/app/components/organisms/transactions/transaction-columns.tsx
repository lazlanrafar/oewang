"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, Table } from "@tanstack/react-table";
import type { Dictionary } from "@workspace/dictionaries";
import { updateTransaction } from "@workspace/modules/transaction/transaction.action";
import type { Transaction } from "@workspace/types";
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { format } from "date-fns";
import {
  Check,
  Copy,
  Edit,
  ExternalLink,
  FileCheck,
  Landmark,
  Loader2,
  MoreHorizontal,
  Receipt,
  Trash,
} from "lucide-react";
import { toast } from "sonner";

import { SelectAccount } from "@/components/molecules/select-account";
import { SelectCategory } from "@/components/molecules/select-category";
import { SelectUser } from "@/components/molecules/select-user";

interface TransactionTableMeta {
  isAllTransactionsSelected?: () => boolean;
  isSomeTransactionsSelected?: () => boolean;
  toggleAllTransactions?: (value: boolean) => void;
  onRowClick?: (transaction: Transaction) => void;
  onDelete?: (id: string) => void;
  getTransactionColor: (type: string) => string;
  formatCurrency: (amount: number) => string;
  canEditWorkspaceData?: boolean;
}

export const transactionColumns = (
  onEdit: (transaction: Transaction) => void,
  dictionary: Dictionary,
  _formatCurrency: (amount: number, options?: { currency?: string }) => string,
  _getTransactionColor: (type: string) => string,
  canEditWorkspaceData = true,
): ColumnDef<Transaction>[] => [
  {
    id: "select",
    header: ({ table }) => {
      const meta = table.options.meta as TransactionTableMeta;
      if (!meta.canEditWorkspaceData) {
        return null;
      }
      const isAllSelected = meta.isAllTransactionsSelected
        ? meta.isAllTransactionsSelected()
        : table.getIsAllPageRowsSelected();
      const isSomeSelected = meta.isSomeTransactionsSelected
        ? meta.isSomeTransactionsSelected()
        : table.getIsSomePageRowsSelected();

      return (
        <Checkbox
          checked={isAllSelected || (isSomeSelected && "indeterminate")}
          onCheckedChange={(value) => {
            if (meta.toggleAllTransactions) {
              meta.toggleAllTransactions(!!value);
            } else {
              table.toggleAllPageRowsSelected(!!value);
            }
          }}
          aria-label={dictionary.common.open_menu}
        />
      );
    },
    cell: ({ row, table }) => {
      const meta = table.options.meta as TransactionTableMeta;
      if (!meta.canEditWorkspaceData) {
        return null;
      }

      return (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={dictionary.common.open_menu}
          className="translate-y-[2px]"
        />
      );
    },
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
    header: dictionary.transactions.date_label,
    cell: ({ row }) => {
      const date = row.getValue("date") as string;

      if (!date || Number.isNaN(new Date(date).getTime())) {
        return <p className="whitespace-nowrap font-sans text-muted-foreground text-xs">-</p>;
      }

      return (
        <p className="whitespace-nowrap font-sans text-muted-foreground text-xs">
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
    header: dictionary.transactions.description_label,
    cell: ({ row, table }) => {
      const transaction = row.original;
      const { getTransactionColor } = (table.options.meta as TransactionTableMeta) || {};
      const _isIncome = transaction?.type === "income";
      const isTransfer = transaction?.type === "transfer";
      const _isExpense = transaction?.type === "expense";

      const label =
        transaction?.name ||
        (isTransfer
          ? dictionary.transactions.types.transfer
          : transaction?.type === "transfer-in"
            ? dictionary.transactions.types.transfer_in
            : transaction?.type === "transfer-out"
              ? dictionary.transactions.types.transfer_out
              : (transaction?.category?.name ?? dictionary.transactions.types.transaction));
      const Icon = transaction?.name ? Landmark : Receipt;

      return (
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex min-w-0 cursor-default items-center gap-2 font-sans">
                <Icon className={cn("h-3 w-3 shrink-0", getTransactionColor(transaction?.type))} />
                <p className={cn("truncate font-medium text-xs", getTransactionColor(transaction?.type))}>{label}</p>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start" className="wrap-break-word max-w-[300px] px-2 py-1 text-[11px]">
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
    header: dictionary.transactions.amount_label,
    cell: ({ row, table }) => {
      const amount = Number(row.getValue("amount"));
      const transaction = row.original;
      const _isExpense = transaction?.type === "expense";
      const _isIncome = transaction?.type === "income";

      const { getTransactionColor, formatCurrency } = (table.options.meta as TransactionTableMeta) || {};

      return (
        <div className={cn("text-right font-medium text-xs", getTransactionColor?.(transaction?.type))}>
          {formatCurrency ? formatCurrency(amount) : amount}
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
    header: dictionary.transactions.account,
    cell: ({ row, table }) => <AccountCell transaction={row.original} table={table} dictionary={dictionary} />,
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
    header: dictionary.transactions.category,
    cell: ({ row, table }) => <CategoryCell transaction={row.original} table={table} dictionary={dictionary} />,
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
    accessorKey: "user?.name",
    header: dictionary.transactions.assign,
    cell: ({ row, table }) => <UserCell transaction={row.original} table={table} dictionary={dictionary} />,
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
    header: dictionary.common.actions,
    cell: ({ row, table }) => (
      <ActionCell
        transaction={row.original}
        table={table}
        dictionary={dictionary}
        onEdit={onEdit}
        canEditWorkspaceData={canEditWorkspaceData}
      />
    ),
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
  dictionary,
}: {
  transaction: Transaction;
  table: Table<Transaction>;
  dictionary: Dictionary;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const canEditWorkspaceData = (table.options.meta as TransactionTableMeta | undefined)?.canEditWorkspaceData !== false;
  const handleCategoryChange = async (categoryId: string) => {
    if (categoryId === transaction?.categoryId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction?.id, {
      categoryId,
    });

    if (res.success) {
      toast.success(dictionary.transactions.toasts.category_updated);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      router.refresh();
    } else {
      toast.error(res.error || dictionary.transactions.errors.save_failed);
    }
    setUpdating(false);
  };

  const canHaveCategory = transaction?.type === "income" || transaction?.type === "expense";

  return (
    <div className="group relative flex h-full w-full items-center">
      {canHaveCategory ? (
        <>
          <SelectCategory
            value={transaction?.categoryId ?? undefined}
            type={transaction?.type as "income" | "expense"}
            onChange={handleCategoryChange}
            disabled={updating || !canEditWorkspaceData}
            variant="ghost"
            className="h-full w-full justify-start rounded-none border-none px-3 hover:bg-transparent focus-visible:ring-0"
          />
          {updating && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            </div>
          )}
        </>
      ) : (
        <span className="ml-3 text-muted-foreground text-xs">-</span>
      )}
    </div>
  );
}

function AccountCell({
  transaction,
  table,
  dictionary,
}: {
  transaction: Transaction;
  table: Table<Transaction>;
  dictionary: Dictionary;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const canEditWorkspaceData = (table.options.meta as TransactionTableMeta | undefined)?.canEditWorkspaceData !== false;
  const handleAccountChange = async (walletId: string) => {
    if (walletId === transaction?.walletId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction?.id, {
      walletId,
    });

    if (res.success) {
      toast.success(dictionary.transactions.toasts.account_updated);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      router.refresh();
    } else {
      toast.error(res.error || dictionary.transactions.errors.save_failed);
    }
    setUpdating(false);
  };

  return (
    <div className="group relative flex h-full w-full items-center">
      <SelectAccount
        value={transaction?.walletId}
        onChange={handleAccountChange}
        disabled={updating || !canEditWorkspaceData}
        variant="ghost"
        className="h-full w-full justify-start rounded-none border-none px-3 hover:bg-transparent focus-visible:ring-0"
      />
      {updating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}

function ActionCell({
  transaction,
  table,
  dictionary,
  onEdit,
  canEditWorkspaceData,
}: {
  transaction: Transaction;
  table: Table<Transaction>;
  dictionary: Dictionary;
  onEdit: (transaction: Transaction) => void;
  canEditWorkspaceData: boolean;
}) {
  const queryClient = useQueryClient();
  const meta = table.options.meta as TransactionTableMeta | undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-transparent">
          <span className="sr-only">{dictionary.common.open_menu}</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 font-sans">
        <DropdownMenuItem onClick={() => meta?.onRowClick?.(transaction)} className="cursor-pointer gap-2">
          <ExternalLink className="h-4 w-4" />
          {dictionary.transactions.view_details}
        </DropdownMenuItem>
        {canEditWorkspaceData ? (
          <DropdownMenuItem onClick={() => onEdit(transaction)} className="cursor-pointer gap-2">
            <Edit className="h-4 w-4" />
            {dictionary.transactions.edit}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => {
            const url = `${window.location.origin}${window.location.pathname}?transactionId=${transaction?.id}`;
            navigator.clipboard.writeText(url);
            toast.success(dictionary.transactions.toasts.link_copied);
          }}
          className="cursor-pointer gap-2"
        >
          <Copy className="h-4 w-4" />
          {dictionary.transactions.copy_link}
        </DropdownMenuItem>

        {canEditWorkspaceData ? (
          <>
            <div className="my-1 h-px bg-muted" />

            <DropdownMenuItem
              onClick={async () => {
                const res = await updateTransaction(transaction?.id, {
                  isReady: !transaction.isReady,
                });
                if (res.success) {
                  toast.success(
                    transaction.isReady
                      ? dictionary.transactions.toasts.marked_pending
                      : dictionary.transactions.toasts.marked_ready,
                  );
                  queryClient.invalidateQueries({ queryKey: ["transactions"] });
                }
              }}
              className="cursor-pointer gap-2"
            >
              <Check className="h-4 w-4" />
              {transaction.isReady ? dictionary.transactions.reset_status : dictionary.transactions.mark_ready}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                const res = await updateTransaction(transaction?.id, {
                  isExported: !transaction.isExported,
                });
                if (res.success) {
                  toast.success(
                    transaction.isExported
                      ? dictionary.transactions.toasts.unmarked_exported
                      : dictionary.transactions.toasts.marked_exported,
                  );
                  queryClient.invalidateQueries({ queryKey: ["transactions"] });
                }
              }}
              className="cursor-pointer gap-2"
            >
              <FileCheck className="h-4 w-4" />
              {transaction.isExported ? dictionary.transactions.reset_export : dictionary.transactions.mark_exported}
            </DropdownMenuItem>

            <div className="my-1 h-px bg-muted" />

            <DropdownMenuItem
              onClick={() => meta?.onDelete?.(transaction?.id)}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
            >
              <Trash className="h-4 w-4" />
              {dictionary.common.delete}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserCell({
  transaction,
  table,
  dictionary,
}: {
  transaction: Transaction;
  table: Table<Transaction>;
  dictionary: Dictionary;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const canEditWorkspaceData =
    (table.options.meta as TransactionTableMeta | undefined)?.canEditWorkspaceData !== false;

  const handleUserChange = async (userId: string) => {
    if (userId === transaction?.assignedUserId) return;

    setUpdating(true);
    const res = await updateTransaction(transaction?.id, {
      assignedUserId: userId,
    });

    if (res.success) {
      toast.success(dictionary.transactions.toasts.assignee_updated);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      router.refresh();
    } else {
      toast.error(res.error || dictionary.transactions.errors.save_failed);
    }
    setUpdating(false);
  };

  return (
    <div className="group relative flex h-full w-full items-center">
      <SelectUser
        value={transaction?.assignedUserId ?? undefined}
        onChange={handleUserChange}
        disabled={updating || !canEditWorkspaceData}
        variant="ghost"
        className="h-full w-full justify-start rounded-none border-none px-3 hover:bg-transparent focus-visible:ring-0"
      />
      {updating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        </div>
      )}
    </div>
  );
}
