"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenuButton,
} from "@workspace/ui";
import { useShallow } from "zustand/react/shallow";

import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { Cat } from "lucide-react";

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
        {/* <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={currentUser?.workspace_id}
        /> */}
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-background text-foreground font-semibold text-sm">
            <Cat className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">Admin Panel</span>
          </div>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      {/* <SidebarFooter>
        {currentUser && (
          <NavUser
            user={{
              name: currentUser.name || currentUser.email,
              email: currentUser.email,
              avatar: currentUser.profile_picture || "",
            }}
          />
        )}
      </SidebarFooter> */}
    </Sidebar>
  );
}
