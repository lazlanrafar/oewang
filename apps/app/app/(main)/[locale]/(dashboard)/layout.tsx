import type { ReactNode } from "react";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getMe } from "@workspace/modules/server";
import {
  cn,
  Separator,
  SIDEBAR_COLLAPSIBLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui";

import { AccountSwitcher } from "@/components/organisms/layout/account-switcher";
import { AppSidebar } from "@/components/organisms/layout/app-sidebar";
import { NotificationBell } from "@/components/organisms/layout/notification-bell";
import { SearchDialog } from "@/components/organisms/search/search-dialog";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { getPreference } from "@/server/server-actions";

async function getUserAndWorkspaces() {
  try {
    // 5-second timeout prevents infinite /sync loop when the API is unreachable
    // or the cookie is unreadable (e.g. missing domain on cross-subdomain requests).
    const result = await Promise.race([
      getMe(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (result && "success" in result && result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function Layout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}>) {
  const cookie_store = await cookies();
  const default_open = cookie_store.get("sidebar_state")?.value !== "false";
  const { locale } = await params;

  const [variant, collapsible, me_data, dictionary] = await Promise.all([
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
    getUserAndWorkspaces(),
    getDictionary(locale),
  ]);

  if (!me_data) {
    // getMe() failed: API unreachable, cookie missing, or token expired.
    // Redirect to login (not /sync) to break any potential redirect loop.
    redirect(`/${locale}/login`);
  }

  const current_user = me_data.user;
  const user_workspaces = me_data.workspaces;

  return (
    <SidebarProvider defaultOpen={default_open}>
      <AppSidebar
        variant={variant}
        collapsible={collapsible}
        currentUser={current_user}
        workspaces={user_workspaces}
        dictionary={dictionary}
      />
      <SidebarInset
        className={cn(
          "h-svh min-w-0 overflow-hidden",
          "[html[data-content-layout=centered]_&]:mx-auto! [html[data-content-layout=centered]_&]:max-w-screen-2xl!",
          "max-[113rem]:peer-data-[variant=inset]:mr-2! min-[101rem]:peer-data-[variant=inset]:peer-data-[state=collapsed]:mr-auto!",
        )}
      >
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
            "sticky top-0 z-50 overflow-hidden rounded-t-[inherit] bg-background/50 backdrop-blur-md",
          )}
        >
          <div className="flex w-full items-center justify-between gap-3 px-4 lg:px-6">
            <div className="flex flex-1 items-center gap-1 lg:gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
              <SearchDialog dictionary={dictionary} />
            </div>
            {current_user && (
              <>
                <NotificationBell dictionary={dictionary} />
                <AccountSwitcher
                  user={{
                    id: current_user.id,
                    name: current_user.name || current_user.email,
                    email: current_user.email,
                    avatar: current_user.profile_picture || "",
                  }}
                  dictionary={dictionary}
                />
              </>
            )}
          </div>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
