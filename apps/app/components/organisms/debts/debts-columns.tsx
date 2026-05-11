"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Dictionary } from "@workspace/dictionaries";
import type { DebtWithContact } from "@workspace/modules/client";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Edit, ExternalLink, MoreHorizontal, Trash } from "lucide-react";

export const debtColumns = (
  onRowClick: (debt: DebtWithContact) => void,
  onEdit: (debt: DebtWithContact) => void,
  onContactClick: (contactId: string) => void,
  onDelete: (id: string) => void,
  dictionary: Dictionary,
): ColumnDef<DebtWithContact>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
    size: 50,
    meta: {
      sticky: true,
      className: "bg-background z-10",
    },
  },
  {
    accessorKey: "type",
    header: dictionary.debts.columns.type,
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      const isReceivable = type === "receivable";

      return (
        <div className="flex items-center gap-2">
          {isReceivable ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-emerald-500/10 text-emerald-500">
              <ArrowDownLeft className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-rose-500/10 text-rose-500">
              <ArrowUpRight className="h-4 w-4" />
            </div>
          )}
          <span className="hidden text-sm capitalize sm:inline-block">
            {isReceivable ? dictionary.debts.types.receivable : dictionary.debts.types.payable}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "contactName",
    header: dictionary.debts.columns.contact,
    cell: ({ row }) => {
      return (
        <button
          type="button"
          className="cursor-pointer font-medium text-sm hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onContactClick(row.original.contactId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onContactClick(row.original.contactId);
            }
          }}
        >
          {row.getValue("contactName")}
        </button>
      );
    },
  },
  {
    accessorKey: "description",
    header: dictionary.debts.columns.description,
    cell: ({ row }) => {
      return (
        <span className="block max-w-[200px] truncate text-left text-foreground/80 text-sm">
          {row.getValue("description") || row.original.sourceTransactionName || "-"}
        </span>
      );
    },
  },
  {
    accessorKey: "amount",
    header: dictionary.debts.columns.summary,
    cell: ({ row, table }) => {
      const amount = Number.parseFloat(row.getValue("amount") as string);
      const remainingAmount = Number.parseFloat(row.original.remainingAmount as string);
      const status = row.original.status;
      const { formatCurrency } = (table.options.meta as { formatCurrency?: (val: number) => string }) || {};

      return (
        <div className="flex flex-col gap-1 text-right sm:text-left">
          <span className="font-medium text-sm">
            {formatCurrency ? formatCurrency(remainingAmount) : remainingAmount}
          </span>
          {status !== "unpaid" && remainingAmount !== amount && (
            <span className="text-muted-foreground text-xs line-through">
              {formatCurrency ? formatCurrency(amount) : amount}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: dictionary.debts.columns.status,
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge
          variant={status === "paid" ? "default" : status === "partial" ? "secondary" : "outline"}
          className="capitalize shadow-none"
        >
          {dictionary.debts.statuses[status] || status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "dueDate",
    header: dictionary.debts.columns.due_date,
    cell: ({ row }) => {
      const dueDateStr = row.getValue("dueDate") as string;
      if (!dueDateStr) return <span className="text-muted-foreground text-sm">-</span>;
      return <span className="text-sm">{format(new Date(dueDateStr), "MMM d, yyyy")}</span>;
    },
  },
  {
    id: "actions",
    header: dictionary.debts.columns.actions,
    enableResizing: false,
    size: 100,
    meta: {
      headerLabel: dictionary.debts.columns.actions,
    },
    cell: ({ row }) => {
      const debt = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-transparent">
              <span className="sr-only">{dictionary.debts.actions.open_menu}</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 font-sans">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRowClick(debt);
              }}
              className="cursor-pointer gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              {dictionary.debts.actions.view_details}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(debt);
              }}
              className="cursor-pointer gap-2"
            >
              <Edit className="h-4 w-4" />
              {dictionary.debts.actions.edit}
            </DropdownMenuItem>
            <div className="my-1 h-px bg-muted" />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete(debt.id);
              }}
              className="cursor-pointer gap-2 text-destructive focus:text-destructive"
            >
              <Trash className="h-4 w-4" />
              {dictionary.debts.actions.delete}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
