"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Markdown,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
} from "@workspace/ui";
import { Lock } from "lucide-react";

import {
  ChatGPTSetupInstructions,
  ClaudeSetupInstructions,
  CursorSetupInstructions,
  PerplexitySetupInstructions,
} from "./mcp-setup-instructions";

interface App {
  id: string;
  name: string;
  category?: string;
  requires_plan?: string;
  active: boolean;
  beta?: boolean;
  logo?: React.ElementType | string;
  short_description?: string;
  description?: string;
  images?: Array<string | { src?: string; default?: { src: string } }>;
  installed: boolean;
  type: "official" | "external";
  installUrl?: string;
  developerName?: string;
  website?: string;
  scopes?: string[];
  settings?: Record<string, unknown>[];
  overview?: string;
}

export interface AppsCardProps {
  app: App & { requires_plan?: string };
  userPlan?: string;
  isExpanded: boolean;
  onExpand: () => void;
  onClose: () => void;
  onInstall?: () => void;
  onDisconnect?: () => void;
  isInstalling?: boolean;
  isDisconnecting?: boolean;
}

const MCP_IDS = new Set(["cursor-mcp", "claude-mcp", "perplexity-mcp", "chatgpt-mcp"]);

function AppLogo({ app, size = "sm" }: { app: App; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-10 w-10 rounded" : "h-8 w-8 rounded";
  if (app.type === "official" && app.logo && typeof app.logo !== "string") {
    return <app.logo />;
  }
  if (app.logo) {
    return (
      // biome-ignore lint/performance/noImgElement: App logo is a dynamic external image
      <img src={app.logo as string} alt={app.name} className={cls} />
    );
  }
  return (
    <div className={`flex items-center justify-center rounded bg-secondary font-bold text-xs uppercase ${cls}`}>
      {app.name.charAt(0)}
    </div>
  );
}

function AppHeroBanner({ app }: { app: App }) {
  return (
    <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden bg-[#fafafa] dark:bg-[#0c0c0c]">
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          backgroundImage: "radial-gradient(circle, #e0e0e0 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      <div className="relative z-10 [&_img]:!h-16 [&_img]:!w-16 [&_svg]:!h-16 [&_svg]:!w-16">
        <AppLogo app={app} size="md" />
      </div>
    </div>
  );
}

function McpSheetContent({ appId }: { appId: string }) {
  if (appId === "cursor-mcp") return <CursorSetupInstructions />;
  if (appId === "claude-mcp") return <ClaudeSetupInstructions />;
  if (appId === "perplexity-mcp") return <PerplexitySetupInstructions />;
  if (appId === "chatgpt-mcp") return <ChatGPTSetupInstructions />;
  return null;
}

export function AppsCard({
  app,
  isExpanded,
  onExpand,
  onClose,
  onInstall,
  onDisconnect,
  isInstalling,
  isDisconnecting,
  userPlan = "Starter",
}: AppsCardProps) {
  const planLevels: Record<string, number> = {
    Starter: 0,
    "Free Tier": 0,
    Pro: 1,
    Business: 2,
  };
  const isLocked = (planLevels[userPlan] ?? 0) < (app.requires_plan ? (planLevels[app.requires_plan] ?? 1) : 0);
  const isMcp = MCP_IDS.has(app.id);

  return (
    <Card className="flex w-full flex-col">
      <Sheet open={isExpanded} onOpenChange={(open) => !open && onClose()}>
        {/* ── Card: logo row ── */}
        <div className="flex h-16 items-center justify-between px-6 pt-6">
          <AppLogo app={app} />
          {app.installed && (
            <div className="rounded-full bg-green-100 px-3 py-1 font-mono text-[10px] text-green-600 dark:bg-green-900/30 dark:text-green-400">
              Installed
            </div>
          )}
        </div>

        {/* ── Card: title + badges ── */}
        <CardHeader className="pb-0 pt-2">
          <div className="flex items-center gap-2 pb-4">
            <CardTitle className="m-0 p-0 font-medium text-md leading-none">{app.name}</CardTitle>
            {!app.active && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Coming soon
              </span>
            )}
            {app.active && app.beta && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px]">Beta</span>
            )}
            {app.requires_plan && (
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 px-2 py-0 font-mono text-[10px] text-primary uppercase"
              >
                {app.requires_plan}
              </Badge>
            )}
          </div>
        </CardHeader>

        {/* ── Card: description ── */}
        <CardContent className="flex-1 pb-4 text-muted-foreground text-xs">
          <p className="line-clamp-2">{app.short_description || app.description || ""}</p>
        </CardContent>

        {/* ── Card: action buttons ── */}
        <div className={`mt-auto px-6 pb-6 ${isMcp ? "" : "grid grid-cols-2 gap-2"}`}>
          {isMcp ? (
            <Button variant="outline" className="w-full" onClick={onExpand}>
              Details
            </Button>
          ) : (
            <>
              <Button variant="outline" className="w-full" onClick={onExpand}>
                Details
              </Button>
              {isLocked ? (
                <Button disabled variant="outline" className="w-full">
                  <Lock className="mr-2 h-3 w-3 text-muted-foreground" />
                  Upgrade
                </Button>
              ) : app.installed ? (
                <Button
                  variant="outline"
                  className="w-full border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                  onClick={onDisconnect}
                  disabled={isDisconnecting}
                >
                  Disconnect
                </Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={onInstall} disabled={!app.active || isInstalling}>
                  Install
                </Button>
              )}
            </>
          )}
        </div>

        {/* ── Sheet ── */}
        <SheetContent className="h-full w-full overflow-hidden p-0">
          <SheetHeader className="h-full overflow-hidden text-left">
            {/* Hero banner */}
            <div className="shrink-0">
              <AppHeroBanner app={app} />
            </div>

            {/* Title row */}
            <div className="flex shrink-0 items-center justify-between border-border border-b px-6 pb-4 pt-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg leading-none">{app.name}</h3>
                  {app.installed && <div className="size-1.5 rounded-full bg-green-500" />}
                </div>
                <span className="mt-1.5 block text-muted-foreground text-xs">
                  {app.category || "Integration"} •{" "}
                  {app.type === "external" ? `By ${app.developerName || "Partner"}` : "By Oewang"}
                </span>
              </div>

              {!isMcp && (
                <div>
                  {isLocked ? (
                    <Button disabled variant="outline" size="sm">
                      <Lock className="mr-2 h-3.5 w-3.5" />
                      Upgrade
                    </Button>
                  ) : app.installed ? (
                    <Button variant="destructive" size="sm" onClick={onDisconnect} disabled={isDisconnecting}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" onClick={onInstall} disabled={!app.active || isInstalling}>
                      Install
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable body */}
            <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden px-6">
              <ScrollArea className="h-0 flex-1" hideScrollbar>
                <Accordion type="multiple" defaultValue={["description"]} className="mt-4">
                  <AccordionItem value="description" className="border-none">
                    <AccordionTrigger className="hover:no-underline">How it works</AccordionTrigger>
                    <AccordionContent className="text-[#878787] text-sm">
                      {isMcp ? (
                        <McpSheetContent appId={app.id} />
                      ) : (
                        <Markdown
                          content={
                            app.description || app.overview || app.short_description || "No description available."
                          }
                        />
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {app.type === "external" && app.website && (
                    <AccordionItem value="website" className="border-none">
                      <AccordionTrigger className="hover:no-underline">Website</AccordionTrigger>
                      <AccordionContent>
                        <a
                          href={app.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          {app.website}
                        </a>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {app.type === "external" && app.scopes && app.scopes.length > 0 && (
                    <AccordionItem value="permissions" className="border-none">
                      <AccordionTrigger className="hover:no-underline">Permissions</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-wrap gap-2">
                          {app.scopes.map((scope) => (
                            <Badge key={scope} variant="secondary">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </ScrollArea>

              {/* Footer */}
              <div className="shrink-0 border-border border-t py-4">
                <p className="text-[10px] text-[#878787]">
                  All apps on the Oewang App Store are open-source and peer-reviewed. Oewang Labs maintains high
                  standards but doesn't endorse third-party apps. Apps published by Oewang are officially certified.
                </p>
                <a
                  href="mailto:support@oewang.dev"
                  className="mt-1 inline-block text-[10px] text-red-500 hover:underline"
                >
                  Report app
                </a>
              </div>
            </div>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </Card>
  );
}
