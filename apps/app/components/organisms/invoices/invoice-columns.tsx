"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Dictionary } from "@workspace/dictionaries";
import type { Invoice } from "@workspace/types";
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@workspace/ui";
import { format } from "date-fns";
import { MoreHorizontal } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  unpaid: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  canceled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return "-";
  }
}

function formatAmount(amount: number | string, currency: string) {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency || "USD",
    }).format(Number(amount));
  } catch {
    return String(amount);
  }
}

type InvoiceRow = Invoice & {
  contact?: { name?: string; email?: string } | null;
};

interface InvoiceColumnsOptions {
  onEdit?: (invoice: InvoiceRow) => void;
  onDelete?: (invoice: InvoiceRow) => void;
  dictionary: Dictionary;
}

export function buildInvoiceColumns({ onEdit, onDelete, dictionary }: InvoiceColumnsOptions): ColumnDef<InvoiceRow>[] {
  const dict = dictionary.invoices;

  return [
    {
      id: "invoiceNumber",
      header: dict.columns.invoice_number || "Invoice No.",
      accessorKey: "invoiceNumber",
      size: 180,
      cell: ({ row }) => <span className="truncate font-medium">{row.original.invoiceNumber}</span>,
    },
    {
      id: "status",
      header: dict.columns.status || "Status",
      accessorKey: "status",
      size: 120,
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge variant="outline" className={STATUS_STYLES[status] ?? ""}>
            {dict.statuses[status] || status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
      },
    },
    {
      id: "contact",
      header: dict.columns.contact || "Contact",
      size: 220,
      cell: ({ row }) => {
        const name = row.original.contact.name ?? "-";
        return <span className="truncate">{name}</span>;
      },
    },
    {
      id: "amount",
      header: dict.columns.amount || "Amount",
      accessorKey: "amount",
      size: 140,
      cell: ({ row }) => <span className="truncate">{formatAmount(row.original.amount, row.original.currency)}</span>,
    },
    {
      id: "issueDate",
      header: dict.columns.issue_date || "Issue Date",
      accessorKey: "issueDate",
      size: 130,
      cell: ({ row }) => <span className="truncate">{formatDate(row.original.issueDate)}</span>,
    },
    {
      id: "dueDate",
      header: dict.columns.due_date || "Due Date",
      accessorKey: "dueDate",
      size: 130,
      cell: ({ row }) => <span className="truncate">{formatDate(row.original.dueDate)}</span>,
    },
    {
      id: "actions",
      header: dict.columns.actions || "Actions",
      size: 100,
      enableHiding: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(row.original)}>{dict.actions.edit || "Edit"}</DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(row.original)}>
                {dict.actions.delete || "Delete"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}
