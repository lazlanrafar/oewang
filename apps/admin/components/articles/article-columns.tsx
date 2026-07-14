"use client";

import React from "react";

import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { deleteArticleAction, updateArticleAction } from "@workspace/modules/article/article.action";
import type { Article } from "@workspace/types";
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

import { useLocalizedRoute } from "@/utils/localized-route";

const CellActions = ({ row }: { row: { original: Article } }) => {
  const article = row.original;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { getLocalizedUrl } = useLocalizedRoute();
  const openEdit = () => router.push(getLocalizedUrl(`/articles/${article.id}/edit`));
  const [isLoading, setIsLoading] = React.useState(false);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-articles-stats"] }),
    ]);

  const handleTogglePublish = async () => {
    setIsLoading(true);
    try {
      const result = await updateArticleAction(article.id, {
        published: !article.published,
      });
      if (result.success) {
        toast.success(article.published ? "Article unpublished" : "Article published");
        await invalidate();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this article?")) return;
    setIsLoading(true);
    try {
      const result = await deleteArticleAction(article.id);
      if (result.success) {
        toast.success("Article deleted");
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
        <DropdownMenuItem onClick={openEdit}>
          <Edit className="mr-2 h-4 w-4" />
          <span>Edit Article</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTogglePublish} disabled={isLoading}>
          {article.published ? (
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
          <span>Delete Article</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const articleColumns: ColumnDef<Article>[] = [
  {
    accessorKey: "title",
    header: "Title",
    size: 300,
    minSize: 180,
    maxSize: 520,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Title",
      className:
        "w-[300px] min-w-[180px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
      skeleton: { type: "text", width: "w-48" },
    },
    cell: ({ getValue }) => <span className="truncate font-medium">{getValue<string>()}</span>,
  },
  {
    accessorKey: "slug",
    header: "Slug",
    size: 220,
    minSize: 140,
    maxSize: 360,
    enableResizing: true,
    meta: {
      headerLabel: "Slug",
      className: "w-[220px] min-w-[140px]",
      skeleton: { type: "text", width: "w-32" },
    },
    cell: ({ getValue }) => (
      <span className="truncate font-mono text-muted-foreground text-xs">{getValue<string>()}</span>
    ),
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
    accessorKey: "created_at",
    header: "Created At",
    size: 160,
    minSize: 120,
    maxSize: 260,
    enableResizing: true,
    meta: {
      headerLabel: "Created At",
      className: "w-[160px] min-w-[120px]",
      skeleton: { type: "text", width: "w-24" },
    },
    cell: ({ getValue }) => {
      const val = getValue<string>();
      if (!val) return "N/A";
      return new Date(val).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
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
