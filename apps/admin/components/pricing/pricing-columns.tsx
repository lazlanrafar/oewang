"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Pricing } from "@workspace/types";
import {
  Badge,
  Button,
  DataTableColumnHeader as TableColumnHeader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { formatCurrency } from "@workspace/utils";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { PricingDialog } from "./pricing-dialog";
import { deletePricingAction } from "@workspace/modules";
import { useRouter } from "next/navigation";

// Cell Actions Component to keep the column definition clean
const CellActions = ({ row }: { row: any }) => {
  const pricing = row.original as Pricing;
  const [isEditOpen, setIsEditOpen] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this pricing plan?")) return;
    const result = await deletePricingAction(pricing.id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error);
    }
  };

  return (
    <>
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
          <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Plan
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isEditOpen && (
        <PricingDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          pricing={pricing}
        />
      )}
    </>
  );
};

export const columns: ColumnDef<Pricing>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <TableColumnHeader column={column} title="Plan Name" />
    ),
    cell: ({ row }) => {
      const is_active = row.original.is_active;
      return (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.getValue("name")}</span>
          {!is_active && (
            <Badge variant="secondary" className="text-xs">
              Inactive
            </Badge>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "price_monthly",
    header: ({ column }) => (
      <TableColumnHeader column={column} title="Monthly" />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number | null>("price_monthly");
      if (val === null || val === undefined)
        return <span className="text-muted-foreground">-</span>;
      return formatCurrency(val / 100, { currency: row.original.currency });
    },
  },
  {
    accessorKey: "price_yearly",
    header: ({ column }) => (
      <TableColumnHeader column={column} title="Yearly" />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number | null>("price_yearly");
      if (val === null || val === undefined)
        return <span className="text-muted-foreground">-</span>;
      return formatCurrency(val / 100, { currency: row.original.currency });
    },
  },
  {
    accessorKey: "price_one_time",
    header: ({ column }) => (
      <TableColumnHeader column={column} title="Lifetime" />
    ),
    cell: ({ row }) => {
      const val = row.getValue<number | null>("price_one_time");
      if (val === null || val === undefined)
        return <span className="text-muted-foreground">-</span>;
      return formatCurrency(val / 100, { currency: row.original.currency });
    },
  },
  {
    accessorKey: "is_active",
    header: ({ column }) => (
      <TableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const val = row.getValue<boolean>("is_active");
      return (
        <Badge variant={val ? "default" : "secondary"}>
          {val ? "Active" : "Inactive"}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id) ? "true" : "false");
    },
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <TableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      return new Date(row.getValue("created_at")).toLocaleDateString();
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <CellActions row={row} />,
  },
];
