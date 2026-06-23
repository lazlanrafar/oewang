"use client";

import { useState, useTransition } from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { updateWorkspacePlanAction } from "@workspace/modules/system-admin/system-admin.action";
import type { SystemAdminPlan, SystemAdminWorkspace } from "@workspace/types";
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
import { Layout, MoreHorizontal, ShieldCheck, Star, Zap } from "lucide-react";
import { toast } from "sonner";

const CellActions = ({ row, plans }: { row: { original: SystemAdminWorkspace }; plans: SystemAdminPlan[] }) => {
  const workspace = row.original;
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  // Manually overriding a paid plan is billing-sensitive — confirm first.
  const [pendingPlan, setPendingPlan] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handlePlanChange = async (planId: string, planName: string) => {
    startTransition(async () => {
      try {
        const result = await updateWorkspacePlanAction(workspace.id, planId);
        if (result.success) {
          toast.success(`Workspace plan updated to ${planName}`);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["admin-workspaces"] }),
            queryClient.invalidateQueries({
              queryKey: ["admin-workspaces-stats"],
            }),
          ]);
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        toast.error("An unexpected error occurred");
      }
    });
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
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Change Plan</DropdownMenuLabel>
          {plans.map((plan) => (
            <DropdownMenuItem
              key={plan.id}
              onClick={() => setPendingPlan({ id: plan.id, name: plan.name })}
              disabled={workspace.plan_id === plan.id}
            >
              {plan.name.toLowerCase().includes("pro") ? (
                <Zap className="mr-2 h-4 w-4 text-amber-500" />
              ) : plan.name.toLowerCase().includes("business") ? (
                <Star className="mr-2 h-4 w-4 text-blue-500" />
              ) : (
                <Layout className="mr-2 h-4 w-4 text-slate-400" />
              )}
              <span>{plan.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pendingPlan !== null} onOpenChange={(open) => !open && setPendingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change workspace plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This manually overrides {workspace.name || "this workspace"}&apos;s plan to{" "}
              <strong>{pendingPlan?.name}</strong>, affecting their billing and feature access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPlan) {
                  handlePlanChange(pendingPlan.id, pendingPlan.name);
                  setPendingPlan(null);
                }
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

export const getWorkspaceColumns = (plans: SystemAdminPlan[]): ColumnDef<SystemAdminWorkspace>[] => [
  {
    accessorKey: "name",
    header: "Name",
    size: 200,
    minSize: 120,
    maxSize: 400,
    enableResizing: true,
    enableHiding: false,
    meta: {
      sticky: true,
      headerLabel: "Name",
      className:
        "w-[200px] min-w-[120px] md:sticky md:left-[var(--stick-left)] bg-background group-hover:bg-[#F2F1EF] group-hover:dark:bg-[#0f0f0f] z-10",
      skeleton: { type: "avatar-text", width: "w-32" },
    },
    cell: ({ row }) => (
      <div className="flex flex-col truncate">
        <span className="font-medium truncate">{row.original.name}</span>
        <span className="text-[10px] text-muted-foreground truncate">{row.original.slug}</span>
      </div>
    ),
  },
  {
    accessorKey: "plan_name",
    header: "Plan",
    size: 150,
    minSize: 100,
    maxSize: 250,
    enableResizing: true,
    meta: {
      headerLabel: "Plan",
      className: "w-[150px] min-w-[100px]",
      skeleton: { type: "badge", width: "w-16" },
    },
    cell: ({ row }) => {
      const planName = row.original.plan_name || "Free";
      const status = row.original.plan_status;

      return (
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              planName.toLowerCase().includes("pro")
                ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                : planName.toLowerCase().includes("business")
                  ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
                  : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
            }
          >
            {planName}
          </Badge>
          <span className="text-[10px] text-muted-foreground uppercase">{status}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "ai_tokens_used",
    header: "AI Tokens",
    size: 120,
    meta: {
      headerLabel: "AI Tokens",
      skeleton: { type: "text", width: "w-16" },
    },
    cell: ({ getValue }) => <span className="text-sm">{(getValue<number>() || 0).toLocaleString()}</span>,
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
    cell: ({ row }) => <CellActions row={row} plans={plans} />,
  },
];
