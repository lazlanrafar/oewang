"use client";

import React from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { deleteFaqAction, updateFaqAction } from "@workspace/modules/faq/faq.action";
import type { Faq } from "@workspace/types";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { CheckCircle, Edit, MoreHorizontal, Trash, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useFaqStore } from "@/stores/faqs";

const CellActions = ({ row }: { row: { original: Faq } }) => {
  const faq = row.original;
  const queryClient = useQueryClient();
  const { openEdit } = useFaqStore();
  const [isLoading, setIsLoading] = React.useState(false);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-faqs"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-faqs-stats"] }),
    ]);

  const handleTogglePublish = async () => {
    setIsLoading(true);
    try {
      const result = await updateFaqAction(faq.id, { published: !faq.published });
      if (result.success) {
        toast.success(faq.published ? "FAQ unpublished" : "FAQ published");
        await invalidate();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this FAQ?")) return;
    setIsLoading(true);
    try {
      const result = await deleteFaqAction(faq.id);
      if (result.success) {
        toast.success("FAQ deleted");
        await invalidate();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsLoading(false);
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
        <DropdownMenuItem onClick={() => openEdit(faq)}>
          <Edit className="mr-2 h-4 w-4" />
          <span>Edit FAQ</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTogglePublish} disabled={isLoading}>
          {faq.published ? (
            <>
              <XCircle className="mr-2 h-4 w-4 text-destructive" />
              <span>Unpublish</span>
            </>
          ) : (
            <>
              <CheckCircle className="mr-2 h-4 w-4 text-success" />
              <span>Publish</span>
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-destructive" disabled={isLoading}>
          <Trash className="mr-2 h-4 w-4" />
          <span>Delete FAQ</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const faqColumns: ColumnDef<Faq>[] = [
  {
    accessorKey: "question",
    header: "Question",
    size: 320,
    minSize: 180,
    maxSize: 560,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Question",
      className:
        "w-[320px] min-w-[180px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
      skeleton: { type: "text", width: "w-48" },
    },
    cell: ({ getValue }) => <span className="truncate font-medium">{getValue<string>()}</span>,
  },
  {
    accessorKey: "category",
    header: "Category",
    size: 160,
    minSize: 100,
    maxSize: 240,
    enableResizing: true,
    meta: {
      headerLabel: "Category",
      className: "w-[160px] min-w-[100px]",
      skeleton: { type: "text", width: "w-20" },
    },
    cell: ({ getValue }) => {
      const val = getValue<string | null>();
      return val ? <span className="text-sm">{val}</span> : <span className="text-muted-foreground italic">—</span>;
    },
  },
  {
    accessorKey: "sort_order",
    header: "Order",
    size: 90,
    minSize: 70,
    maxSize: 140,
    enableResizing: true,
    meta: {
      headerLabel: "Order",
      className: "w-[90px] min-w-[70px]",
      skeleton: { type: "text", width: "w-8" },
    },
    cell: ({ getValue }) => <span>{getValue<number>()}</span>,
  },
  {
    accessorKey: "published",
    header: "Status",
    size: 120,
    minSize: 90,
    maxSize: 200,
    enableResizing: true,
    meta: {
      headerLabel: "Status",
      className: "w-[120px] min-w-[90px]",
      skeleton: { type: "badge", width: "w-14" },
    },
    cell: ({ getValue }) => {
      const published = getValue<boolean>();
      return <Badge variant={published ? "success" : "secondary"}>{published ? "Published" : "Draft"}</Badge>;
    },
  },
  {
    id: "actions",
    header: "Actions",
    size: 90,
    enableHiding: false,
    meta: { headerLabel: "Actions", skeleton: { type: "icon" } },
    cell: ({ row }) => <CellActions row={row} />,
  },
];
