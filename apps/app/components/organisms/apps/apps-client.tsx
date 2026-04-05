"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn, Input, Tabs, TabsList, TabsTrigger } from "@workspace/ui";
import { Search, Grid2X2, Link as LinkIcon } from "lucide-react";
import { apps as appStoreApps } from "@workspace/integrations";
import { useQuery } from "@tanstack/react-query";
import { getIntegrationsAction } from "@workspace/modules/integrations/integrations.action";
import { getMe } from "@workspace/modules/user/user.action";
import { AppsCard } from "./apps-card";
import { ConnectTelegram } from "./connect-telegram";
import { ConnectWhatsApp } from "./connect-whatsapp";

export function AppsClient() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "connected">("all");
  const [expandedApp, setExpandedApp] = React.useState<string | null>(null);

  // Fetch real integrations from the API
  const { data: installedApps, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const result = await getIntegrationsAction();
      if (result.success) return result.data;
      return [];
    },
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      return result.success ? result.data : null;
    },
  });

  // Transform official apps
  const transformedOfficialApps = appStoreApps
    .filter((app) => !app.hidden)
    .map((app) => {
    // Check if the app is installed via the integrations API response
    const isInstalled =
      installedApps?.some(
        (installed: any) => installed.provider === app.id && installed.isActive,
      ) ?? false;

    return {
      id: app.id,
      name: app.name,
      category: "category" in app ? app.category : "Integration",
      requires_plan: app.id.startsWith("whatsapp") ? "Pro" : undefined,
      active: app.active,
      beta:
        "beta" in app && typeof app.beta === "boolean" ? app.beta : undefined,
      logo: app.logo,
      short_description: app.short_description,
      description: "description" in app ? app.description : undefined,
      images: "images" in app ? app.images : [],
      installed: isInstalled,
      type: "official" as const,
      onInitialize:
        "onInitialize" in app && typeof (app as any).onInitialize === "function"
          ? async ({
              accessToken,
              onComplete,
            }: {
              accessToken: string;
              onComplete?: () => void;
            }) => {
              const result = (app as any).onInitialize({
                accessToken,
                onComplete,
              });
              return result instanceof Promise
                ? result
                : Promise.resolve(result);
            }
          : undefined,
      settings:
        "settings" in app && Array.isArray((app as any).settings)
          ? (app as any).settings
          : undefined,
      userSettings:
        (installedApps?.find((inst: any) => inst.provider === app.id)
          ?.settings as Record<string, any>) || undefined,
      // Include installUrl for apps with external download pages
      installUrl:
        "installUrl" in app && typeof (app as any).installUrl === "string"
          ? (app as any).installUrl
          : undefined,
    };
  });

  // Since Oewang doesn't have OAuth Applications currently, we use an empty array.
  // In the future, this is where transformedExternalApps will go.
  const transformedExternalApps: any[] = [
    {
      id: "oewang-app",
      name: "Oewang App",
      category: "Mobile",
      active: false, // Coming soon
      logo: undefined,
      short_description: "Manage your finances on the go with the Oewang mobile app.",
      description: "The Oewang mobile app will allow you to track expenses, scan receipts, and manage your budget directly from your smartphone.\n\n**Coming Soon**\nWe are currently developing our mobile application for both iOS and Android. Stay tuned for updates!",
      installed: false,
      type: "official",
    },
  ];

  // Combine all apps
  const allApps = [...transformedOfficialApps, ...transformedExternalApps];

  const filteredApps = allApps.filter((app) => {
    if (filter === "connected" && !app.installed) return false;
    if (search && !app.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const activeWorkspace = me?.workspaces.find(
    (w) => w.id === me.user.workspace_id,
  );
  const planName = activeWorkspace?.plan_name || "Starter";

  const activeApp = allApps.find((a) => a.id === expandedApp);

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        {/* Search on left */}
        <div className="relative w-full sm:max-w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter apps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background/50 border-border h-9"
          />
        </div>

        {/* Filter Toggle on right */}
        <div className="flex items-stretch bg-[#f7f7f7] dark:bg-[#131313] w-fit">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="flex items-stretch h-auto p-0 bg-transparent">
              <TabsTrigger
                value="all"
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-[14px] transition-all whitespace-nowrap border border-transparent h-9 min-h-9",
                  "text-[#707070] hover:text-black bg-[#f7f7f7] dark:text-[#666666] dark:hover:text-white dark:bg-[#131313] mb-0 relative z-1",
                  "data-[state=active]:text-black data-[state=active]:bg-[#e6e6e6] dark:data-[state=active]:text-white dark:data-[state=active]:bg-[#1d1d1d] data-[state=active]:-mb-px data-[state=active]:z-10",
                )}
              >
                <Grid2X2 className="w-4 h-4" />
                All Apps
              </TabsTrigger>
              <TabsTrigger
                value="connected"
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-[14px] transition-all whitespace-nowrap border border-transparent h-9 min-h-9",
                  "text-[#707070] hover:text-black bg-[#f7f7f7] dark:text-[#666666] dark:hover:text-white dark:bg-[#131313] mb-0 relative z-1",
                  "data-[state=active]:text-black data-[state=active]:bg-[#e6e6e6] dark:data-[state=active]:text-white dark:data-[state=active]:bg-[#1d1d1d] data-[state=active]:-mb-px data-[state=active]:z-10",
                )}
              >
                <LinkIcon className="w-4 h-4" />
                Connected
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 mx-auto mt-8">
        {filteredApps.map((app) => (
          <AppsCard
            key={app.id}
            app={app}
            userPlan={planName}
            isExpanded={expandedApp === app.id}
            onExpand={() => setExpandedApp(app.id)}
            onClose={() => setExpandedApp(null)}
            onInstall={async () => {
              if (app.onInitialize) {
                await app.onInitialize({
                  accessToken: "",
                  onComplete: () => {
                    // queryClient.invalidateQueries({ queryKey: ["integrations"] });
                  },
                });
              }
            }}
            onDisconnect={() => {
              // placeholder
              console.log("Disconnect", app.id);
            }}
          />
        ))}

        {filteredApps.length === 0 && !isLoading && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <h3 className="text-lg font-semibold text-foreground">
              {search ? "No apps found" : "No apps available"}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-sm">
              {search
                ? "No apps found for your search. Try different keywords."
                : "There are currently no apps available in the store."}
            </p>
          </div>
        )}
      </div>
      <ConnectTelegram />
      <ConnectWhatsApp />
    </div>
  );
}
