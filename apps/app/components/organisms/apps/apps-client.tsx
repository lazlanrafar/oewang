"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { apps as appStoreApps } from "@workspace/integrations";
import {
  disconnectIntegrationAction,
  getIntegrationsAction,
} from "@workspace/modules/integrations/integrations.action";
import { getMe } from "@workspace/modules/user/user.action";
import { FilterToggle, Input } from "@workspace/ui";
import { Grid2X2, Link as LinkIcon, Search } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "../../providers/confirm-modal-provider";
import { AppsCard } from "./apps-card";
import { ConnectTelegram } from "./connect-telegram";
import { ConnectWhatsApp } from "./connect-whatsapp";

interface Props {
  dictionary: Dictionary;
}

interface InstalledIntegration {
  provider: string;
  isActive: boolean;
  settings?: Record<string, unknown>;
}

interface CurrentUser {
  user: { workspace_id: string };
  workspaces: Array<{ id: string; plan_name?: string }>;
}

type AppCardModel = React.ComponentProps<typeof AppsCard>["app"] & {
  onInitialize?: (args: { accessToken: string; onComplete?: () => void }) => Promise<unknown>;
  userSettings?: Record<string, unknown>;
};

export function AppsClient({ dictionary }: Props) {
  const t = dictionary.apps;
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const _router = useRouter();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "connected">("all");
  const [expandedApp, setExpandedApp] = React.useState<string | null>(null);
  const [disconnectingAppId, setDisconnectingAppId] = React.useState<string | null>(null);

  // Fetch real integrations from the API
  const { data: installedApps = [], isLoading } = useQuery<InstalledIntegration[]>({
    queryKey: ["integrations"],
    queryFn: async () => {
      const result = await getIntegrationsAction();
      if (result.success) return result.data as InstalledIntegration[];
      return [];
    },
  });

  const { data: me } = useQuery<CurrentUser | null>({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      return result.success ? (result.data as CurrentUser) : null;
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const result = await disconnectIntegrationAction(provider);
      if (!result.success) {
        throw new Error(result.error || "Failed to disconnect integration");
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      queryClient.invalidateQueries({ queryKey: ["integrations", "telegram-connect"] });
      toast.success("Integration disconnected");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to disconnect integration";
      toast.error(message);
    },
    onSettled: () => setDisconnectingAppId(null),
  });

  // Transform official apps
  const transformedOfficialApps: AppCardModel[] = appStoreApps.map((app) => {
      // Check if the app is installed via the integrations API response
      const isInstalled = installedApps.some((installed) => installed.provider === app.id && installed.isActive);

      return {
        id: app.id,
        name: app.name,
        category: "category" in app ? app.category : "Integration",
        requires_plan: app.id === "whatsapp-twilio" ? "Pro" : undefined,
        active: app.active,
        beta: "beta" in app && typeof app.beta === "boolean" ? app.beta : undefined,
        logo: app.logo,
        short_description: app.short_description,
        description: "description" in app ? (app.description ?? undefined) : undefined,
        images: "images" in app ? app.images : [],
        installed: isInstalled,
        type: "official" as const,
        onInitialize:
          "onInitialize" in app && typeof (app as Record<string, unknown>).onInitialize === "function"
            ? async ({ accessToken, onComplete }: { accessToken: string; onComplete?: () => void }) => {
                const result = (
                  app as { onInitialize: (args: { accessToken: string; onComplete?: () => void }) => unknown }
                ).onInitialize({
                  accessToken,
                  onComplete,
                });
                return result instanceof Promise ? result : Promise.resolve(result);
              }
            : undefined,
        settings:
          "settings" in app && Array.isArray((app as { settings?: Record<string, unknown>[] }).settings)
            ? (app as { settings?: Record<string, unknown>[] }).settings
            : undefined,
        userSettings: installedApps.find((inst) => inst.provider === app.id)?.settings || undefined,
        // Include installUrl for apps with external download pages
        installUrl:
          "installUrl" in app && typeof (app as { installUrl?: string }).installUrl === "string"
            ? (app as { installUrl?: string }).installUrl
            : undefined,
      };
    });

  const transformedExternalApps: AppCardModel[] = [];

  // Combine all apps
  const allApps = [...transformedOfficialApps, ...transformedExternalApps];

  const filteredApps = allApps.filter((app) => {
    if (filter === "connected" && !app.installed) return false;
    if (search && !app.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeWorkspace = me?.workspaces.find((w) => w.id === me.user.workspace_id);
  const planName = activeWorkspace?.plan_name || "Starter";

  const _activeApp = allApps.find((a) => a.id === expandedApp);

  if (!dictionary || !t) return null;

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        {/* Search on left */}
        <div className="relative w-full sm:max-w-[280px]">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.filter_placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 border-border bg-background/50 pl-9"
          />
        </div>

        {/* Filter Toggle on right */}
        <FilterToggle
          value={filter}
          onValueChange={(v) => setFilter(v as "all" | "connected")}
          options={[
            { value: "all", label: t.tabs.all },
            { value: "connected", label: t.tabs.connected },
          ]}
        />
      </div>

      <div className="mx-auto mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
              (async () => {
                const ok = await confirm({
                  title: `Disconnect ${app.name}?`,
                  description: "This will stop syncing messages from this app to your workspace.",
                  confirmLabel: "Disconnect",
                  cancelLabel: "Cancel",
                  destructive: true,
                });
                if (!ok) return;

                setDisconnectingAppId(app.id);
                disconnectMutation.mutate(app.id);
              })();
            }}
            isDisconnecting={disconnectMutation.isPending && disconnectingAppId === app.id}
          />
        ))}

        {filteredApps.length === 0 && !isLoading && (
          <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <h3 className="font-semibold text-foreground text-lg">
              {search ? t.empty.no_results_title : t.empty.no_apps_title}
            </h3>
            <p className="mt-2 max-w-sm text-muted-foreground text-sm">
              {search ? t.empty.no_results_desc.replace("{search}", search) : t.empty.no_apps_desc}
            </p>
          </div>
        )}
      </div>
      <ConnectTelegram dictionary={dictionary} />
      <ConnectWhatsApp dictionary={dictionary} />
    </div>
  );
}
