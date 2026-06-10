"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { BudgetStatus, TransactionSettings } from "@workspace/types";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Progress,
} from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/providers/confirm-modal-provider";
import { deleteBudget } from "@workspace/modules/client";

const CellActions = ({
  row,
  onEdit,
}: {
  row: { original: BudgetStatus };
  onEdit: (budget: BudgetStatus) => void;
}) => {
  const budget = row.original;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete budget?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;

    try {
      const result = await deleteBudget(budget.id);
      if (result.success) {
        toast.success("Budget deleted successfully");
        queryClient.invalidateQueries({ queryKey: ["budgets"] });
      } else {
        toast.error(result.message || "Failed to delete budget");
      }
    } catch (_error) {
      toast.error("Something went wrong");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(budget)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Edit</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const budgetColumns = (
  onEdit: (budget: BudgetStatus) => void,
  settings: TransactionSettings | null,
  locale: string,
): ColumnDef<BudgetStatus>[] => [
  {
    accessorKey: "categoryName",
    header: "Category",
    size: 220,
    minSize: 150,
    maxSize: 400,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Category",
      className:
        "w-[220px] min-w-[150px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
      skeleton: { type: "text", width: "w-32" },
    },
    cell: ({ getValue }) => (
      <span className="truncate px-2 font-medium font-sans">{getValue<string>()}</span>
    ),
  },
  {
    accessorKey: "amount",
    header: "Budget",
    size: 150,
    minSize: 100,
    maxSize: 250,
    enableResizing: true,
    meta: {
      headerLabel: "Budget",
      className: "w-[150px] min-w-[100px] justify-end text-right",
      skeleton: { type: "text", width: "w-20" },
    },
    cell: ({ getValue }) => (
      <span className="block w-full px-2 text-right font-medium font-sans tabular-nums">
        {formatCurrency(getValue<number>(), settings, { locale })}
      </span>
    ),
  },
  {
    accessorKey: "spent",
    header: "Spent",
    size: 150,
    minSize: 100,
    maxSize: 250,
    enableResizing: true,
    meta: {
      headerLabel: "Spent",
      className: "w-[150px] min-w-[100px] justify-end text-right",
      skeleton: { type: "text", width: "w-20" },
    },
    cell: ({ row }) => {
      const isOver = row.original.spent > row.original.amount;
      return (
        <span
          className={cn(
            "block w-full px-2 text-right font-medium font-sans tabular-nums",
            isOver && "text-destructive",
          )}
        >
          {formatCurrency(row.original.spent, settings, { locale })}
        </span>
      );
    },
  },
  {
    accessorKey: "remaining",
    header: "Remaining",
    size: 150,
    minSize: 100,
    maxSize: 250,
    enableResizing: true,
    meta: {
      headerLabel: "Remaining",
      className: "w-[150px] min-w-[100px] justify-end text-right",
      skeleton: { type: "text", width: "w-20" },
    },
    cell: ({ row }) => {
      const remaining = row.original.amount - row.original.spent;
      const isOver = remaining < 0;
      return (
        <span
          className={cn(
            "block w-full px-2 text-right font-medium font-sans tabular-nums",
            isOver ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {formatCurrency(remaining, settings, { locale })}
        </span>
      );
    },
  },
  {
    accessorKey: "percentage",
    header: "Spent %",
    size: 220,
    minSize: 180,
    maxSize: 360,
    enableResizing: true,
    meta: {
      headerLabel: "Spent %",
      className: "w-[220px] min-w-[180px]",
      skeleton: { type: "text", width: "w-32" },
    },
    cell: ({ row }) => {
      const pct = row.original.percentage;
      const isOver = pct > 100;
      const isWarning = pct >= 80 && !isOver;
      const colorClass = isOver
        ? "text-destructive"
        : isWarning
          ? "text-yellow-600 dark:text-yellow-500"
          : "text-muted-foreground";
      const barClass = isOver
        ? "[&>div]:bg-destructive"
        : isWarning
          ? "[&>div]:bg-yellow-500"
          : "";

      return (
        <div className="flex w-full items-center gap-3 px-2">
          <Progress value={Math.min(pct, 100)} className={cn("h-1.5 flex-1 bg-muted", barClass)} />
          <span className={cn("min-w-[3rem] text-right font-medium text-xs tabular-nums", colorClass)}>
            {pct}%
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "",
    size: 60,
    minSize: 60,
    maxSize: 60,
    enableResizing: false,
    enableHiding: false,
    meta: {
      className: "w-[60px] justify-center",
      skeleton: { type: "icon" },
    },
    cell: ({ row }) => <CellActions row={row} onEdit={onEdit} />,
  },
];
