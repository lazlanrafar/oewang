import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Sheet,
  SheetContent,
  SheetHeader,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  ScrollArea,
  Badge,
  Markdown,
} from "@workspace/ui";

type App = any;

export interface AppsCardProps {
  app: App;
  isExpanded: boolean;
  onExpand: () => void;
  onClose: () => void;
  onInstall?: () => void;
  onDisconnect?: () => void;
  isInstalling?: boolean;
  isDisconnecting?: boolean;
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
}: AppsCardProps) {
  return (
    <Card className="w-full flex flex-col">
      <Sheet open={isExpanded} onOpenChange={(open) => !open && onClose()}>
        <div className="pt-6 px-6 h-16 flex items-center justify-between">
          {app.type === "official" &&
          app.logo &&
          typeof app.logo !== "string" ? (
            <app.logo />
          ) : app.logo ? (
            <img
              src={app.logo as string}
              alt={app.name}
              className="w-8 h-8 rounded"
            />
          ) : (
            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center font-bold text-xs uppercase">
              {app.name.charAt(0)}
            </div>
          )}

          <div className="flex items-center gap-2">
            {app.installed && (
              <div className="text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-3 py-1 rounded-full font-mono uppercase tracking-wider font-semibold">
                Installed
              </div>
            )}
          </div>
        </div>

        <CardHeader className="pb-0 pt-2">
          <div className="flex items-center space-x-2 pb-4">
            <CardTitle className="text-md font-medium leading-none p-0 m-0">
              {app.name}
            </CardTitle>
            {!app.active && (
              <span className="text-muted-foreground bg-secondary text-[10px] px-2 py-0.5 rounded-full font-mono">
                Coming soon
              </span>
            )}
            {app.active && app.beta && (
              <span className="text-foreground bg-secondary text-[10px] px-2 py-0.5 rounded-full font-mono">
                Beta
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground pb-4 flex-1">
          <p className="line-clamp-2">
            {app.short_description || app.description || ""}
          </p>
        </CardContent>

        <div className="px-6 pb-6 grid grid-cols-2 gap-2 mt-auto">
          <Button
            variant="outline"
            className="w-full"
            disabled={!app.active}
            onClick={onExpand}
          >
            Details
          </Button>

          {app.installUrl ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={onInstall}
              disabled={!app.active}
            >
              {app.id === "midday-desktop" ? "Download" : "Install"}
            </Button>
          ) : app.installed ? (
            <Button
              variant="outline"
              className="w-full bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border-primary/20"
              onClick={onDisconnect}
              disabled={isDisconnecting}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={onInstall}
              disabled={!app.active || isInstalling}
            >
              Install
            </Button>
          )}
        </div>

        <SheetContent className="sm:max-w-[465px] h-full overflow-y-auto w-full p-0">
          <SheetHeader className="p-6 text-left">
            {app.images && app.images.length > 0 && (
              <div className="mb-4">
                <img
                  src={
                    typeof app.images[0] === "string"
                      ? app.images[0]
                      : (app.images[0] as any)?.default?.src ||
                        (app.images[0] as any)?.src
                  }
                  alt={app.name}
                  className="w-full h-auto rounded-lg object-cover"
                />
              </div>
            )}

            <div className="flex items-center justify-between border-b border-border pb-4 mt-2">
              <div className="flex items-center space-x-3">
                {app.type === "official" &&
                app.logo &&
                typeof app.logo !== "string" ? (
                  <app.logo />
                ) : app.logo ? (
                  <img
                    src={app.logo as string}
                    alt={app.name}
                    className="w-10 h-10 rounded"
                  />
                ) : (
                  <div className="w-10 h-10 rounded bg-secondary flex items-center justify-center font-bold uppercase">
                    {app.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-xl font-bold leading-none">
                      {app.name}
                    </h3>
                    {app.installed && (
                      <div className="bg-green-500 rounded-full w-2 h-2" />
                    )}
                  </div>

                  <span className="text-xs text-muted-foreground mt-2 block">
                    {app.category || "Integration"} •{" "}
                    {app.type === "external"
                      ? `By ${app.developerName || "Partner"}`
                      : "By Oewang"}
                  </span>
                </div>
              </div>

              <div>
                {app.installed ? (
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
                <Accordion
                  type="multiple"
                  defaultValue={["description"]}
                  className="mt-4"
                >
                  <AccordionItem value="description" className="border-none">
                    <AccordionTrigger className="hover:no-underline font-semibold">
                      How it works
                    </AccordionTrigger>
                    <AccordionContent>
                      <Markdown
                        content={
                          app.description ||
                          app.overview ||
                          app.short_description ||
                          "No description available."
                        }
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {app.type === "external" && (
                    <>
                      {app.website && (
                        <AccordionItem value="website" className="border-none">
                          <AccordionTrigger className="hover:no-underline font-semibold">
                            Website
                          </AccordionTrigger>
                          <AccordionContent>
                            <a
                              href={app.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm hover:underline text-primary"
                            >
                              {app.website}
                            </a>
                          </AccordionContent>
                        </AccordionItem>
                      )}

                      {app.scopes && app.scopes.length > 0 && (
                        <AccordionItem
                          value="permissions"
                          className="border-none"
                        >
                          <AccordionTrigger className="hover:no-underline font-semibold">
                            Permissions
                          </AccordionTrigger>
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
                    <h4 className="font-semibold text-lg mb-2">
                      Settings & Configuration
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Configuration options will appear here once the
                      integration is installed.
                    </p>
                  </div>
                )}
              </ScrollArea>

              <div className="pt-8 mt-6 border-t border-border">
                <p className="text-[10px] text-muted-foreground">
                  All apps on the Oewang App Store are open-source and
                  peer-reviewed. Oewang Labs maintains high standards but doesn't
                  endorse third-party apps unless officially certified.
                </p>
                <a
                  href="mailto:support@oewang.dev"
                  className="text-[10px] text-red-500 hover:underline mt-1 inline-block"
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
