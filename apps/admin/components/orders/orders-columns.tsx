"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { AdminOrderListing } from "@workspace/types";
import { Badge } from "@workspace/ui";
import { formatSubunits } from "@workspace/utils";
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
      skeleton: { type: "text", width: "w-24" },
    },
    cell: ({ row }) => (
      <span className="font-mono text-green">{row.original.code}</span>
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
      skeleton: { type: "text", width: "w-32" },
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
      skeleton: { type: "avatar-text", width: "w-40" },
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
      skeleton: { type: "text", width: "w-20" },
    },
    cell: ({ row }) => (
      <span className="font-medium text-sm">
        {formatSubunits(row.original.amount, row.original.currency)}
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
      skeleton: { type: "badge", width: "w-16" },
    },
    cell: ({ row }) => {
      const status = row.original.status;

      const colorClass =
        status === "paid"
          ? "border-transparent bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400"
          : status === "pending"
            ? "border-transparent bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-400"
            : status === "failed" || status === "canceled"
              ? "border-transparent bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-400"
              : "border-transparent bg-muted text-muted-foreground";

      return (
        <Badge variant="outline" className={`capitalize ${colorClass}`}>
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
      skeleton: { type: "text", width: "w-28" },
    },
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {format(new Date(row.original.created_at), "MMM d, yyyy HH:mm")}
      </span>
    ),
  },
];
