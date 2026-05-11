import { useParams } from "next/navigation";

import type { Dictionary } from "@workspace/dictionaries";
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
  dictionary: Dictionary;
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
  dictionary,
}: AppsCardProps) {
  const params = useParams();
  const _locale = (params.locale as string) || "en";

  const planLevels: Record<string, number> = {
    Starter: 0,
    "Free Tier": 0,
    Pro: 1,
    Business: 2,
  };

  const currentLevel = planLevels[userPlan] ?? 0;
  const requiredLevel = app.requires_plan ? (planLevels[app.requires_plan] ?? 1) : 0;
  const isLocked = currentLevel < requiredLevel;
  return (
    <Card className="flex w-full flex-col">
      <Sheet open={isExpanded} onOpenChange={(open) => !open && onClose()}>
        <div className="flex h-16 items-center justify-between px-6 pt-6">
          {app.type === "official" && app.logo && typeof app.logo !== "string" ? (
            <app.logo />
          ) : app.logo ? (
            <>
              {/* biome-ignore lint/performance/noImgElement: App logo is a dynamic external image */}
              <img src={app.logo as string} alt={app.name} className="h-8 w-8 rounded" />
            </>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-secondary font-bold text-xs uppercase">
              {app.name.charAt(0)}
            </div>
          )}

          <div className="flex items-center gap-2">
            {app.installed && (
              <div className="rounded-full bg-green-100 px-3 py-1 font-mono font-semibold text-[10px] text-green-600 uppercase tracking-wider dark:bg-green-900/30 dark:text-green-400">
                Installed
              </div>
            )}
          </div>
        </div>

        <CardHeader className="pt-2 pb-0">
          <div className="flex items-center space-x-2 pb-4">
            <CardTitle className="m-0 p-0 font-medium text-md leading-none">{app.name}</CardTitle>
            {!app.active && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                Coming soon
              </span>
            )}
            {app.active && app.beta && (
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-foreground">Beta</span>
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
        <CardContent className="flex-1 pb-4 text-muted-foreground text-xs">
          <p className="line-clamp-2">{app.short_description || app.description || ""}</p>
        </CardContent>

        <div className="mt-auto grid grid-cols-2 gap-2 px-6 pb-6">
          <Button variant="outline" className="w-full" disabled={!app.active} onClick={onExpand}>
            Details
          </Button>

          {isLocked ? (
            <Button disabled variant="outline" className="group w-full">
              <Lock className="mr-2 h-3 w-3 text-muted-foreground transition-colors" />
              {dictionary.common.coming_soon || "Coming Soon"}
            </Button>
          ) : app.installUrl ? (
            <Button variant="outline" className="w-full" onClick={onInstall} disabled={!app.active}>
              {app.id === "midday-desktop" ? "Download" : "Install"}
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
        </div>

        <SheetContent className="h-full w-full overflow-y-auto p-0 sm:max-w-[465px]">
          <SheetHeader className="p-6 text-left">
            {app.images && app.images.length > 0 && (
              <div className="mb-4">
                {/* biome-ignore lint/performance/noImgElement: App screenshot is a dynamic external image */}
                <img
                  src={
                    typeof app.images[0] === "string"
                      ? app.images[0]
                      : (app.images[0] as { default?: { src: string }; src?: string }).default?.src ||
                        (app.images[0] as { src?: string }).src
                  }
                  alt={app.name}
                  className="h-auto w-full rounded-lg object-cover"
                />
              </div>
            )}

            <div className="mt-2 flex items-center justify-between border-border border-b pb-4">
              <div className="flex items-center space-x-3">
                {app.type === "official" && app.logo && typeof app.logo !== "string" ? (
                  <app.logo />
                ) : app.logo ? (
                  <>
                    {/* biome-ignore lint/performance/noImgElement: App logo is a dynamic external image */}
                    <img src={app.logo as string} alt={app.name} className="h-10 w-10 rounded" />
                  </>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-secondary font-bold uppercase">
                    {app.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-xl leading-none">{app.name}</h3>
                    {app.installed && <div className="h-2 w-2 rounded-full bg-green-500" />}
                  </div>

                  <span className="mt-2 block text-muted-foreground text-xs">
                    {app.category || "Integration"} •{" "}
                    {app.type === "external" ? `By ${app.developerName || "Partner"}` : "By Oewang"}
                  </span>
                </div>
              </div>

              <div>
                {isLocked ? (
                  <Button disabled variant="default" className="w-full font-medium">
                    <Lock className="mr-2 h-4 w-4" />
                    {dictionary.common.coming_soon || "Coming Soon"}
                  </Button>
                ) : app.installed ? (
                  <Button
                    variant="destructive"
                    className="w-full font-medium"
                    onClick={onDisconnect}
                    disabled={isDisconnecting}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    className="w-full font-medium"
                    onClick={onInstall}
                    disabled={!app.active || isInstalling}
                  >
                    {app.id === "midday-desktop" ? "Download" : "Install"}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4">
              <ScrollArea className="h-full pt-2">
                <Accordion type="multiple" defaultValue={["description"]} className="mt-4">
                  <AccordionItem value="description" className="border-none">
                    <AccordionTrigger className="font-semibold hover:no-underline">How it works</AccordionTrigger>
                    <AccordionContent>
                      <Markdown
                        content={
                          app.description || app.overview || app.short_description || "No description available."
                        }
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {app.type === "external" && (
                    <>
                      {app.website && (
                        <AccordionItem value="website" className="border-none">
                          <AccordionTrigger className="font-semibold hover:no-underline">Website</AccordionTrigger>
                          <AccordionContent>
                            <a
                              href={app.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-sm hover:underline"
                            >
                              {app.website}
                            </a>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {app.scopes && app.scopes.length > 0 && (
                        <AccordionItem value="permissions" className="border-none">
                          <AccordionTrigger className="font-semibold hover:no-underline">Permissions</AccordionTrigger>
                          <AccordionContent>
                            <div className="flex flex-wrap gap-2">
                              {app.scopes.map((scope: string) => (
                                <Badge key={scope} variant="secondary">
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )}
                    </>
                  )}
                </Accordion>

                {(!app.type || app.type !== "external") && app.settings && (
                  <div className="mt-8 mb-4">
                    <h4 className="mb-2 font-semibold text-lg">Settings & Configuration</h4>
                    <p className="text-muted-foreground text-sm">
                      Configuration options will appear here once the integration is installed.
                    </p>
                  </div>
                )}
              </ScrollArea>

              <div className="mt-6 border-border border-t pt-8">
                <p className="text-[10px] text-muted-foreground">
                  All apps on the Oewang App Store are open-source and peer-reviewed. Oewang Labs maintains high
                  standards but doesn't endorse third-party apps unless officially certified.
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
