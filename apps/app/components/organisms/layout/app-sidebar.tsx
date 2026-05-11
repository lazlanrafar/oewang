"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, usePreferencesStore } from "@workspace/ui";
import { useShallow } from "zustand/react/shallow";

import type { AppDictionary } from "@/modules/types/dictionary";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

import { NavMain } from "./nav-main";
import { NavUsage } from "./nav-usage";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

type WorkspaceData = {
  id: string;
  name: string;
  slug: string;
  role?: string;
  plan_name?: string | null;
  max_workspaces?: number | null;
  ai_tokens_used?: number;
  vault_size_used_bytes?: number;
  max_ai_tokens?: number | null;
  max_vault_size_mb?: number | null;
};

type UserData = {
  id: string;
  email: string;
  name: string | null;
  profile_picture: string | null;
  workspace_id: string | null;
};

export function AppSidebar({
  currentUser,
  workspaces,
  dictionary,
  ...rest
}: React.ComponentProps<typeof Sidebar> & {
  currentUser: UserData | null;
  workspaces: WorkspaceData[];
  dictionary: AppDictionary;
}) {
  const { sidebarVariant, sidebarCollapsible, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.sidebarVariant,
      sidebarCollapsible: s.sidebarCollapsible,
      isSynced: s.isSynced,
    })),
  );

  const variant = isSynced ? sidebarVariant : rest.variant;
  const collapsible = isSynced ? sidebarCollapsible : rest.collapsible;

  const activeWorkspace = workspaces.find((w) => w.id === currentUser?.workspace_id);

  return (
    <Sidebar {...rest} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={currentUser?.workspace_id ?? undefined}
          dictionary={dictionary}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} dictionary={dictionary} />
      </SidebarContent>
      <SidebarFooter>
        <NavUsage workspace={activeWorkspace} dictionary={dictionary} />
        {currentUser && (
          <NavUser
            user={{
              name: currentUser.name || currentUser.email,
              email: currentUser.email,
              avatar: currentUser.profile_picture || "",
            }}
            dictionary={dictionary}
          />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
