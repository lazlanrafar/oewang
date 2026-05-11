"use client";

import * as React from "react";

import { switchWorkspaceAction } from "@workspace/modules/user/user.action";
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
import { Cat, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { type AppDictionary, getDictionaryText } from "@/modules/types/dictionary";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";

type WorkspaceData = {
  id: string;
  name: string;
  slug: string;
  role?: string;
  plan_name?: string | null;
  max_workspaces?: number | null;
};

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  dictionary,
}: {
  workspaces: WorkspaceData[];
  activeWorkspaceId?: string | null;
  dictionary: AppDictionary;
}) {
  const { isMobile } = useSidebar();
  const [activeWorkspace, setActiveWorkspace] = React.useState(
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0] ?? null,
  );

  const [isSwitching, setIsSwitching] = React.useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  const t = (key: string, variables?: Record<string, string | number>) =>
    getDictionaryText(dictionary, key, key, variables);

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
    if (workspace?.id === activeWorkspace?.id) return;

    setIsSwitching(true);
    try {
      const result = await switchWorkspaceAction(workspace?.id);
      if (result.success) {
        setActiveWorkspace(workspace);
        toast.success(t("workspace.switcher.switch_success", { name: workspace?.name }));
        // Refresh to ensure all data is refetched with new workspace context
        window.location.reload();
      } else {
        toast.error(result.error || t("workspace.switcher.switch_error"));
      }
    } catch (_error) {
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
              <span className="flex aspect-square size-8 items-center justify-center rounded bg-foreground font-semibold text-background text-sm">
                {isSwitching ? <Loader2 className="size-4 animate-spin" /> : <Cat className="size-4" />}
              </span>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeWorkspace.name}</span>
                <span className="truncate text-xs capitalize">{activeWorkspace.plan_name || "Free"}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {t("workspace.switcher.title")}
            </DropdownMenuLabel>
            {workspaces.map((workspace, index) => (
              <DropdownMenuItem
                key={workspace?.id}
                onClick={() => handleSwitch(workspace)}
                className="gap-2 p-2"
                disabled={isSwitching}
              >
                <div className="flex size-6 items-center justify-center border font-semibold text-xs">
                  {workspace?.name.charAt(0).toUpperCase()}
                </div>
                {workspace?.name}
                <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 p-2"
              onClick={() => {
                const ownedWorkspaces = workspaces.filter((w) => w.role === "owner");
                const maxAllowed = workspaces.reduce((max, curr) => {
                  return Math.max(max, curr.max_workspaces ?? 1);
                }, 1);

                if (ownedWorkspaces.length >= maxAllowed) {
                  toast.error(
                    t("workspace.switcher.limit_reached", {
                      maxLimit: maxAllowed,
                    }),
                  );
                  return;
                }

                setIsCreateModalOpen(true);
              }}
            >
              <div className="flex size-6 items-center justify-center border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">{t("workspace.switcher.add_workspace")}</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <CreateWorkspaceDialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />
    </SidebarMenu>
  );
}
