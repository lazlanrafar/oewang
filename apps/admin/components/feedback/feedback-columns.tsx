"use client";

import { useState, useTransition } from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { updateFeedbackStatusAction } from "@workspace/modules/feedback/feedback.action";
import type { Feedback, FeedbackStatus } from "@workspace/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "planned", label: "Planned" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
];

// Terminal transitions are hard to undo casually — confirm first, same
// reasoning as workspace-columns.tsx's billing-sensitive plan change.
const CONFIRM_REQUIRED: FeedbackStatus[] = ["resolved", "rejected"];

const STATUS_BADGE_CLASS: Record<FeedbackStatus, string> = {
  new: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  in_review:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  planned:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  resolved:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  rejected:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

const CellActions = ({ row }: { row: { original: Feedback } }) => {
  const feedback = row.original;
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<FeedbackStatus | null>(null);

  const applyStatus = (status: FeedbackStatus) => {
    startTransition(async () => {
      try {
        const result = await updateFeedbackStatusAction(feedback.id, status);
        if (result.success) {
          toast.success("Feedback status updated");
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["admin-feedback"] }),
            queryClient.invalidateQueries({
              queryKey: ["admin-feedback-stats"],
            }),
          ]);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("An unexpected error occurred");
      }
    });
  };

  const handleSelect = (status: FeedbackStatus) => {
    if (CONFIRM_REQUIRED.includes(status)) {
      setPendingStatus(status);
    } else {
      applyStatus(status);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Change status</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {STATUS_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => handleSelect(option.value)}
              disabled={feedback.status === option.value}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark feedback as {pendingStatus}?</AlertDialogTitle>
            <AlertDialogDescription>
              This closes out the submission. You can still change the status again later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingStatus) applyStatus(pendingStatus);
                setPendingStatus(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const getFeedbackColumns = (): ColumnDef<Feedback>[] => [
  {
    accessorKey: "message",
    header: "Message",
    size: 320,
    minSize: 200,
    maxSize: 500,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Message",
      className:
        "min-w-[200px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
      skeleton: { type: "text", width: "w-48" },
    },
    cell: ({ row }) => {
      const f = row.original;
      const submitter = f.email || (f.user_id ? "App user" : "Anonymous");
      return (
        <div className="flex flex-col truncate">
          <span className="truncate font-medium">{f.message}</span>
          <span className="truncate text-[10px] text-muted-foreground">{submitter}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "type",
    header: "Type",
    size: 130,
    meta: {
      headerLabel: "Type",
      skeleton: { type: "badge", width: "w-16" },
    },
    cell: ({ getValue }) => <Badge variant="outline">{getValue<string>().replace("_", " ")}</Badge>,
  },
  {
    accessorKey: "source",
    header: "Source",
    size: 100,
    meta: {
      headerLabel: "Source",
      skeleton: { type: "badge", width: "w-16" },
    },
    cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge>,
  },
  {
    accessorKey: "status",
    header: "Status",
    size: 120,
    meta: {
      headerLabel: "Status",
      skeleton: { type: "badge", width: "w-16" },
    },
    cell: ({ getValue }) => {
      const status = getValue<FeedbackStatus>();
      return (
        <Badge variant="outline" className={STATUS_BADGE_CLASS[status]}>
          {status.replace("_", " ")}
        </Badge>
      );
    },
  },
  {
    accessorKey: "screenshot_url",
    header: "Screenshot",
    size: 110,
    meta: {
      headerLabel: "Screenshot",
      skeleton: { type: "text", width: "w-12" },
    },
    cell: ({ getValue }) => {
      const url = getValue<string | null>();
      if (!url) return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 text-xs underline hover:text-blue-700"
        >
          View
        </a>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Created At",
    size: 160,
    enableResizing: true,
    meta: {
      headerLabel: "Created At",
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
    size: 90,
    enableHiding: false,
    meta: {
      headerLabel: "Actions",
      skeleton: { type: "icon" },
    },
    cell: ({ row }) => <CellActions row={row} />,
  },
];
