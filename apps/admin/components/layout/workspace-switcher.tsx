"use client";

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui";
import { ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { switchWorkspaceAction } from "@/actions/user.actions";

type WorkspaceData = {
  id: string;
  name: string;
  slug: string;
  role?: string;
};

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceData[];
  activeWorkspaceId?: string | null;
}) {
  const { isMobile } = useSidebar();
  const [activeWorkspace, setActiveWorkspace] = React.useState(
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0] ?? null,
  );

  const [isSwitching, setIsSwitching] = React.useState(false);

  // Sync state if activeWorkspaceId changes (e.g. from parent)
  React.useEffect(() => {
    if (activeWorkspaceId) {
      const found = workspaces.find((w) => w.id === activeWorkspaceId);
      if (found) {
        setActiveWorkspace(found);
      }
    }
  }, [activeWorkspaceId, workspaces]);

  const handleSwitch = async (workspace: WorkspaceData) => {
    if (workspace.id === activeWorkspace?.id) return;

    setIsSwitching(true);
    try {
      const result = await switchWorkspaceAction(workspace.id);
      if (result.success) {
        setActiveWorkspace(workspace);
        toast.success(`Switched to ${workspace.name}`);
        // Refresh to ensure all data is refetched with new workspace context
        window.location.reload();
      } else {
        toast.error(result.error || "Failed to switch workspace");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSwitching(false);
    }
  };

  if (!activeWorkspace) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-semibold text-sm">
                {isSwitching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  activeWorkspace.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeWorkspace.name}</span>
                <span className="truncate text-xs capitalize">{activeWorkspace.role || "member"}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">Workspaces</DropdownMenuLabel>
            {workspaces.map((workspace, index) => (
              <DropdownMenuItem
                key={workspace.id}
                onClick={() => handleSwitch(workspace)}
                className="gap-2 p-2"
                disabled={isSwitching}
              >
                <div className="flex size-6 items-center justify-center rounded-sm border font-semibold text-xs">
                  {workspace.name.charAt(0).toUpperCase()}
                </div>
                {workspace.name}
                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Add workspace</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
