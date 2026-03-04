"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { SystemAdminUser } from "@workspace/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui";
import { MoreHorizontal, Shield, User, Landmark } from "lucide-react";
import { updateSystemRoleAction } from "@workspace/modules/system-admin/system-admin.action";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const CellActions = ({ row }: { row: { original: SystemAdminUser } }) => {
  const user = row.original;
  const router = useRouter();

  const handleRoleChange = async (role: "owner" | "finance" | "user") => {
    try {
      const result = await updateSystemRoleAction(user.id, role);
      if (result.success) {
        toast.success(`User role updated to ${role}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (error) {
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
        <DropdownMenuItem onClick={() => handleRoleChange("owner")}>
          <Shield className="mr-2 h-4 w-4" />
          <span>Make Owner</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRoleChange("finance")}>
          <Landmark className="mr-2 h-4 w-4" />
          <span>Make Finance</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleRoleChange("user")}>
          <User className="mr-2 h-4 w-4" />
          <span>Make User</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    },
    cell: ({ getValue }) => (
      <span className="truncate font-medium">
        {getValue<string>() || "N/A"}
      </span>
    ),
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
    },
    cell: ({ getValue }) => (
      <span className="truncate text-muted-foreground">
        {getValue<string>()}
      </span>
    ),
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
    minSize: 120,
    maxSize: 260,
    enableResizing: true,
    meta: {
      headerLabel: "Created At",
      className: "w-[160px] min-w-[120px]",
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
    },
    cell: ({ row }) => <CellActions row={row} />,
  },
];
