"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@workspace/ui";
import { Search } from "lucide-react";
import { apps as appStoreApps } from "@workspace/integrations";
import { useQuery } from "@tanstack/react-query";
import { getIntegrationsAction } from "@workspace/modules/integrations/integrations.action";
import { AppsCard } from "./apps-card";
import { ConnectTelegram } from "./connect-telegram";

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

  // Since Okane doesn't have OAuth Applications currently, we use an empty array.
  // In the future, this is where transformedExternalApps will go.
  const transformedExternalApps: any[] = [];

  // Combine all apps
  const allApps = [...transformedOfficialApps, ...transformedExternalApps];

  const filteredApps = allApps.filter((app) => {
    if (filter === "connected" && !app.installed) return false;
    if (search && !app.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const activeApp = allApps.find((a) => a.id === expandedApp);

  return (
    <div className="space-y-8 w-full">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect your third-party services to enhance your experience.
          </p>
        </div>
        <div className="flex gap-4 w-full sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter apps..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background/50 border-border"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="bg-background border border-border text-sm rounded-md px-3 py-2 w-full sm:w-auto h-10 outline-none focus:ring-2 focus:ring-ring focus:border-input"
          >
            <option value="all">All Apps</option>
            <option value="connected">Connected</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 mx-auto mt-8">
        {filteredApps.map((app) => (
          <AppsCard
            key={app.id}
            app={app}
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
    </div>
  );
}
