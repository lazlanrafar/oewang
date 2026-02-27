"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Button,
} from "@workspace/ui";
import { MoreHorizontal, UserCog } from "lucide-react";

import { updateSystemRoleAction } from "@workspace/modules";
import type { SystemAdminUser } from "@workspace/types";

export function AdminActionsDropdown({ user }: { user: SystemAdminUser }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRoleChange = (role: "owner" | "finance" | "user") => {
    startTransition(async () => {
      const result = await updateSystemRoleAction(user.id, role);
      if (result.success) {
        toast.success(`Role updated to ${role} for ${user.name || user.email}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0" disabled={isPending}>
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled className="opacity-100 font-medium">
          <UserCog className="mr-2 h-4 w-4" />
          Assign Role
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleRoleChange("owner")}
          disabled={user.system_role === "owner"}
        >
          - Owner
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleRoleChange("finance")}
          disabled={user.system_role === "finance"}
        >
          - Finance
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleRoleChange("user")}
          disabled={user.system_role === "user"}
        >
          - User
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
