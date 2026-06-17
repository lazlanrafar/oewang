"use client";

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { updateSystemRoleAction } from "@workspace/modules/system-admin/system-admin.action";
import type { SystemAdminUser } from "@workspace/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { Landmark, MoreHorizontal, Shield, User } from "lucide-react";
import { toast } from "sonner";

type AssignableRole = "owner" | "finance" | "user";

const CellActions = ({ row }: { row: { original: SystemAdminUser } }) => {
  const user = row.original;
  const queryClient = useQueryClient();
  // Role changes grant/revoke admin access, so require explicit confirmation
  // rather than mutating on a single dropdown click.
  const [pendingRole, setPendingRole] = useState<AssignableRole | null>(null);

  const handleRoleChange = async (role: AssignableRole) => {
    setPendingRole(null);
    try {
      const result = await updateSystemRoleAction(user.id, role);
      if (result.success) {
        toast.success(`User role updated to ${role}`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
          queryClient.invalidateQueries({ queryKey: ["admin-users-stats"] }),
        ]);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
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
          <DropdownMenuItem onClick={() => setPendingRole("owner")}>
            <Shield className="mr-2 h-4 w-4" />
            <span>Make Owner</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPendingRole("finance")}>
            <Landmark className="mr-2 h-4 w-4" />
            <span>Make Finance</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPendingRole("user")}>
            <User className="mr-2 h-4 w-4" />
            <span>Make User</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={pendingRole !== null} onOpenChange={(open) => !open && setPendingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change user role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will set {user.email || "this user"}&apos;s system role to <strong>{pendingRole}</strong>. Their
              administrative access changes immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingRole && handleRoleChange(pendingRole)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const userColumns: ColumnDef<SystemAdminUser>[] = [
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
      skeleton: { type: "text", width: "w-32" },
    },
    cell: ({ getValue }) => <span className="truncate font-medium">{getValue<string>() || "N/A"}</span>,
  },
  {
    accessorKey: "email",
    header: "Email",
    size: 260,
    minSize: 160,
    maxSize: 500,
    enableResizing: true,
    meta: {
      headerLabel: "Email",
      className: "w-[260px] min-w-[160px]",
      skeleton: { type: "avatar-text", width: "w-40" },
    },
    cell: ({ getValue }) => <span className="truncate text-muted-foreground">{getValue<string>()}</span>,
  },
  {
    accessorKey: "system_role",
    header: "Role",
    size: 120,
    minSize: 80,
    maxSize: 200,
    enableResizing: true,
    meta: {
      headerLabel: "Role",
      className: "w-[120px] min-w-[80px]",
      skeleton: { type: "badge", width: "w-14" },
    },
    cell: ({ getValue }) => {
      const role = getValue<string>();
      return (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            role === "owner"
              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
              : role === "finance"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          }`}
        >
          {role}
        </span>
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
