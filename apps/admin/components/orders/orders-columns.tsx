"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AdminOrderListing } from "@workspace/types";
import { Badge } from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";
import { format } from "date-fns";

export const columns: ColumnDef<AdminOrderListing>[] = [
  {
    accessorKey: "id",
    header: "Order ID",
    cell: ({ row }) => (
      <span className="font-mono text-xs">
        {row.original.id.slice(0, 8)}...
      </span>
    ),
  },
  {
    accessorKey: "workspaceName",
    header: "Workspace",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium text-sm">
          {row.original.workspaceName || "N/A"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "userEmail",
    header: "Customer",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm">{row.original.userName || "N/A"}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.userEmail || "N/A"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-medium text-sm">
        {formatCurrency(row.original.amount / 100, {
          currency: row.original.currency.toUpperCase(),
        })}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status;
      let variant: "default" | "secondary" | "destructive" | "outline" =
        "default";

      switch (status) {
        case "paid":
          variant = "default"; // Assuming default is success green/blue in this theme
          break;
        case "pending":
          variant = "secondary";
          break;
        case "failed":
        case "canceled":
          variant = "destructive";
          break;
      }

      return (
        <Badge variant={variant} className="capitalize">
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Date",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {format(new Date(row.original.created_at), "MMM d, yyyy HH:mm")}
      </span>
    ),
  },
];
