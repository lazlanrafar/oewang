"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Customer } from "@workspace/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { Globe, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomer } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";

const CellActions = ({
  row,
  onEdit,
}: {
  row: { original: Customer };
  onEdit: (customer: Customer) => void;
}) => {
  const customer = row.original;
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${customer.name}?`)) return;
    try {
      const result = await deleteCustomer(customer.id);
      if (result.success) {
        toast.success("Customer deleted successfully");
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      } else {
        toast.error(result.error || "Failed to delete customer");
      }
    } catch {
      toast.error("An unexpected error occurred");
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
        <DropdownMenuItem onClick={() => onEdit(customer)}>
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

export const getCustomerColumns = (
  onEdit: (customer: Customer) => void,
): ColumnDef<Customer>[] => [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <a
        href={`mailto:${row.original.email}`}
        className="text-muted-foreground hover:text-foreground transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.email}
      </a>
    ),
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.phone ?? "—"}</span>
    ),
  },
  {
    accessorKey: "website",
    header: "Website",
    cell: ({ row }) =>
      row.original.website ? (
        <a
          href={`https://${row.original.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Globe className="h-3.5 w-3.5" />
          {row.original.website}
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "location",
    header: "Location",
    cell: ({ row }) => {
      const parts = [row.original.city, row.original.country].filter(Boolean);
      return (
        <span className="text-muted-foreground">
          {parts.length > 0 ? parts.join(", ") : "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "contact",
    header: "Contact",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.contact ?? "—"}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellActions row={row} onEdit={onEdit} />,
  },
];
