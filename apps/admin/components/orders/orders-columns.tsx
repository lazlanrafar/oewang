"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AdminOrderListing } from "@workspace/types";
import { Badge } from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";
import { format } from "date-fns";

export const columns: ColumnDef<AdminOrderListing>[] = [
  {
    accessorKey: "code",
    header: "Order ID",
    size: 140,
    minSize: 100,
    maxSize: 250,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Order ID",
      className:
        "w-[140px] min-w-[100px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
    },
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.code}</span>
    ),
  },
  {
    accessorKey: "workspaceName",
    header: "Workspace",
    size: 200,
    minSize: 140,
    maxSize: 400,
    enableResizing: true,
    meta: {
      headerLabel: "Workspace",
      className: "w-[200px] min-w-[140px]",
    },
    cell: ({ row }) => (
      <div className="flex flex-col truncate">
        <span className="font-medium text-sm truncate">
          {row.original.workspaceName || "N/A"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "userEmail",
    header: "Customer",
    size: 240,
    minSize: 180,
    maxSize: 400,
    enableResizing: true,
    meta: {
      headerLabel: "Customer",
      className: "w-[240px] min-w-[180px]",
    },
    cell: ({ row }) => (
      <div className="flex flex-col truncate">
        <span className="text-sm truncate">
          {row.original.userName || "N/A"}
        </span>
        <span className="text-xs text-muted-foreground truncate">
          {row.original.userEmail || "N/A"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    size: 140,
    minSize: 100,
    maxSize: 200,
    enableResizing: true,
    meta: {
      headerLabel: "Amount",
      className: "w-[140px] min-w-[100px]",
    },
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
    size: 120,
    minSize: 90,
    maxSize: 200,
    enableResizing: true,
    meta: {
      headerLabel: "Status",
      className: "w-[120px] min-w-[90px]",
    },
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
    size: 180,
    minSize: 140,
    maxSize: 300,
    enableResizing: true,
    meta: {
      headerLabel: "Date",
      className: "w-[180px] min-w-[140px]",
    },
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {format(new Date(row.original.created_at), "MMM d, yyyy HH:mm")}
      </span>
    ),
  },
];
