"use client";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@workspace/ui";
import { useShallow } from "zustand/react/shallow";

import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@workspace/ui";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

type WorkspaceData = {
  id: string;
  name: string;
  slug: string;
  role?: string;
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
  ...rest
}: React.ComponentProps<typeof Sidebar> & {
  currentUser: UserData | null;
  workspaces: WorkspaceData[];
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

  return (
    <Sidebar {...rest} variant={variant} collapsible={collapsible}>
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={currentUser?.workspace_id} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        {currentUser && (
          <NavUser
            user={{
              name: currentUser.name || currentUser.email,
              email: currentUser.email,
              avatar: currentUser.profile_picture || "",
            }}
          />
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
