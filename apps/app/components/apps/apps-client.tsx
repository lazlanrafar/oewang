"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Skeleton,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui";
import {
  Cloud,
  Search,
  ExternalLink,
  Info,
  MessageCircle,
  Github,
  Figma,
  Mail,
  Slack,
  Box,
  Coffee,
} from "lucide-react";
import { toast } from "sonner";

import {
  getTransactionSettings,
  updateTransactionSettings,
} from "@workspace/modules/setting/setting.action";
import {
  getIntegrationsAction,
  connectWhatsAppAction,
} from "@workspace/modules/integrations/integrations.action";

const MOCK_APPS = [
  {
    id: "discord",
    name: "Discord",
    desc: "Connect with Discord for seamless team communication.",
    icon: MessageCircle,
  },
  {
    id: "docker",
    name: "Docker",
    desc: "Effortlessly manage Docker containers on your dashboard.",
    icon: Box,
  },
  {
    id: "figma",
    name: "Figma",
    desc: "View and collaborate on Figma designs in one place.",
    icon: Figma,
  },
  {
    id: "github",
    name: "GitHub",
    desc: "Streamline code management with GitHub integration.",
    icon: Github,
  },
  {
    id: "gmail",
    name: "Gmail",
    desc: "Access and manage Gmail messages effortlessly.",
    icon: Mail,
  },
  {
    id: "slack",
    name: "Slack",
    desc: "Connect with Slack for team collaboration.",
    icon: Slack,
  },
];

export function AppsClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<
    "all" | "connected" | "not_connected"
  >("all");
  const [expandedApp, setExpandedApp] = React.useState<string | null>(null);

  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ["transaction-settings"],
    queryFn: async () => {
      const result = await getTransactionSettings();
      if (result.success) return result.data;
      return null;
    },
  });

  const { data: integrations, isLoading: isIntegrationsLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const result = await getIntegrationsAction();
      if (result.success) return result.data;
      return [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateTransactionSettings,
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["transaction-settings"] });
        toast.success("Storage settings updated successfully");
        setExpandedApp(null);
      } else {
        toast.error(res.error || "Failed to update settings");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update settings");
    },
  });

  const whatsappMutation = useMutation({
    mutationFn: connectWhatsAppAction,
    onSuccess: (res) => {
      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ["integrations"] });
        toast.success("WhatsApp connected successfully!");
        setExpandedApp(null);
      } else {
        toast.error(res.error || "Failed to connect WhatsApp");
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to connect WhatsApp");
    },
  });

  const [r2Data, setR2Data] = React.useState({
    r2Endpoint: "",
    r2AccessKeyId: "",
    r2SecretAccessKey: "",
    r2BucketName: "",
  });
  const [waPhone, setWaPhone] = React.useState("");

  React.useEffect(() => {
    if (settings) {
      setR2Data({
        r2Endpoint: settings.r2Endpoint || "",
        r2AccessKeyId: settings.r2AccessKeyId || "",
        r2SecretAccessKey: settings.r2SecretAccessKey || "",
        r2BucketName: settings.r2BucketName || "",
      });
    }
  }, [settings]);

  React.useEffect(() => {
    if (integrations) {
      const wa = integrations.find((i: any) => i.provider === "whatsapp");
      if (wa && wa.settings?.phoneNumber) {
        setWaPhone(wa.settings.phoneNumber);
      }
    }
  }, [integrations]);

  if (isSettingsLoading || isIntegrationsLoading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const isR2Configured = Boolean(
    settings?.r2BucketName && settings?.r2Endpoint,
  );
  const isWaConfigured = Boolean(
    integrations?.find((i: any) => i.provider === "whatsapp" && i.isActive),
  );

  const allApps: Array<{
    id: string;
    name: string;
    desc: string;
    icon: any;
    connected: boolean;
    isReal: boolean;
    renderContent?: () => React.ReactNode;
  }> = [
    {
      id: "cloudflare-r2",
      name: "Cloudflare R2 Storage",
      desc: "Use your own Cloudflare R2 bucket for file storage.",
      icon: Cloud,
      connected: isR2Configured,
      isReal: true,
      renderContent: () => (
        <div className="space-y-6">
          <div className="bg-background/50 p-4 rounded-lg flex gap-3 items-start border border-muted">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-foreground">
                Why connect your own storage?
              </p>
              <p className="text-muted-foreground">
                By default, files are stored in our secure system bucket.
                Connecting your own R2 bucket gives you full control and
                ownership over your data.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="endpoint">Endpoint</Label>
              <Input
                id="endpoint"
                placeholder="https://<id>.r2.cloudflarestorage.com"
                value={r2Data.r2Endpoint}
                onChange={(e) =>
                  setR2Data({ ...r2Data, r2Endpoint: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket Name</Label>
              <Input
                id="bucket"
                placeholder="my-vault-bucket"
                value={r2Data.r2BucketName}
                onChange={(e) =>
                  setR2Data({ ...r2Data, r2BucketName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKey">Access Key ID</Label>
              <Input
                id="accessKey"
                type="password"
                placeholder="Enter Access Key ID"
                value={r2Data.r2AccessKeyId}
                onChange={(e) =>
                  setR2Data({ ...r2Data, r2AccessKeyId: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretKey">Secret Access Key</Label>
              <Input
                id="secretKey"
                type="password"
                placeholder="Enter Secret Access Key"
                value={r2Data.r2SecretAccessKey}
                onChange={(e) =>
                  setR2Data({ ...r2Data, r2SecretAccessKey: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            {isR2Configured && (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (confirm("Reset to system storage?")) {
                    updateMutation.mutate({
                      r2Endpoint: null,
                      r2AccessKeyId: null,
                      r2SecretAccessKey: null,
                      r2BucketName: null,
                    });
                  }
                }}
              >
                Reset Default
              </Button>
            )}
            <Button
              onClick={() => updateMutation.mutate(r2Data)}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </div>
      ),
    },
    {
      id: "whatsapp",
      name: "WhatsApp AI Receipts (Beta)",
      desc: "Chat with a WhatsApp bot to quickly add receipts and track transactions using AI.",
      icon: MessageCircle,
      connected: isWaConfigured,
      isReal: true,
      renderContent: () => (
        <div className="space-y-6">
          <div className="bg-background/50 p-4 rounded-lg flex gap-3 items-start border border-muted">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-foreground">How it Works:</p>
              <p className="text-muted-foreground">
                Enter your WhatsApp phone number below. We use this to
                authenticate incoming images. Send any image of a receipt to our
                designated Twilio WhatsApp number and our AI will automatically
                parse it and save it as an Expense!
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waPhone">Your Phone Number</Label>
            <Input
              id="waPhone"
              placeholder="e.g. +1234567890"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Include country code (e.g., +1 for US, +44 for UK).
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => whatsappMutation.mutate(waPhone)}
              disabled={whatsappMutation.isPending || !waPhone}
            >
              {whatsappMutation.isPending ? "Saving..." : "Save Connection"}
            </Button>
          </div>
        </div>
      ),
    },
    ...MOCK_APPS.map((a) => ({ ...a, connected: false, isReal: false })),
  ];

  const filteredApps = allApps.filter((app) => {
    if (filter === "connected" && !app.connected) return false;
    if (filter === "not_connected" && app.connected) return false;
    if (search && !app.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="max-w-7xl space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Connect your third-party services to enhance your experience.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
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
          <option value="not_connected">Not Connected</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredApps.map((app) => (
          <Card
            key={app.id}
            className={`flex flex-col border transition-all duration-200 isolate overflow-hidden ${
              app.connected
                ? "border-primary/50 shadow-sm"
                : "border-border shadow-none"
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-transparent">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center border border-border">
                <app.icon className="h-5 w-5 text-foreground" />
              </div>
              {app.connected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors pointer-events-auto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedApp(expandedApp === app.id ? null : app.id);
                  }}
                >
                  Connected
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="pointer-events-auto shadow-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    app.isReal
                      ? setExpandedApp(expandedApp === app.id ? null : app.id)
                      : toast.info("Integration coming soon!");
                  }}
                >
                  Connect
                </Button>
              )}
            </CardHeader>
            <div className="px-6 pb-6 flex-1 flex flex-col justify-start">
              <h3 className="font-semibold text-base text-foreground mt-2">
                {app.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {app.desc}
              </p>
            </div>
          </Card>
        ))}
      </div>

      <Sheet
        open={!!expandedApp}
        onOpenChange={(open) => !open && setExpandedApp(null)}
      >
        <SheetContent side="right">
          {(() => {
            const activeApp = allApps.find((a) => a.id === expandedApp);
            if (!activeApp) return null;
            return (
              <>
                <SheetHeader className="pb-2">
                  <SheetTitle className="flex items-center gap-3 text-xl font-bold">
                    <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center border border-border">
                      <activeApp.icon className="h-5 w-5 text-foreground" />
                    </div>
                    {activeApp.name}
                  </SheetTitle>
                  <SheetDescription className="pt-2">
                    {activeApp.desc}
                  </SheetDescription>
                </SheetHeader>
                <div className="py-6">
                  {activeApp.renderContent && activeApp.renderContent()}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
