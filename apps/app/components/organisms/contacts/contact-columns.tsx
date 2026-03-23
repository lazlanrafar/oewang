"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { Contact } from "@workspace/types";
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
import { deleteContact } from "@workspace/modules/client";
import { useQueryClient } from "@tanstack/react-query";

const CellActions = ({
  row,
  onEdit,
  dictionary,
}: {
  row: { original: Contact };
  onEdit: (contact: Contact) => void;
  dictionary: any;
}) => {
  const contact = row.original;
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    if (
      !confirm(
        `${dictionary.contacts.details.delete_confirm_title}\n\n${dictionary.contacts.details.delete_confirm_desc}`,
      )
    )
      return;
    try {
      const result = await deleteContact(contact.id);
      if (result.success) {
        toast.success(dictionary.contacts.toasts.deleted);
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      } else {
        toast.error(result.error || dictionary.contacts.toasts.delete_failed);
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
        <DropdownMenuLabel>
          {dictionary.transactions.actions.title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(contact)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>{dictionary.contacts.details.edit_contact}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          <span>{dictionary.contacts.details.delete_contact}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const getContactColumns = (
  onEdit: (contact: Contact) => void,
  dictionary: any,
): ColumnDef<Contact>[] => [
  {
    accessorKey: "name",
    header: dictionary.contacts.columns.name,
    cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
  },
  {
    accessorKey: "email",
    header: dictionary.contacts.columns.email,
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
    header: dictionary.contacts.columns.phone,
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
    accessorKey: "addressLine1",
    header: dictionary.contacts.columns.address,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.addressLine1 ?? "—"}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <CellActions row={row} onEdit={onEdit} dictionary={dictionary} />
    ),
  },
];
