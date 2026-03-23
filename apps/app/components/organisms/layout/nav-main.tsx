"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@workspace/ui";
import { ChevronRight, MailIcon, PlusCircleIcon } from "lucide-react";

import type { NavGroup, NavMainItem } from "@/navigation/sidebar/sidebar-items";

import { useAppStore } from "@/stores/app";

interface NavMainProps {
  readonly items: readonly NavGroup[];
}

import { useLocalizedRoute } from "@/utils/localized-route";
import { i18n } from "@/i18n-config";

const IsComingSoon = ({ dictionary }: { dictionary: any }) => (
  <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
    {dictionary.sidebar.coming_soon}
  </span>
);

const NavItemExpanded = ({
  item,
  isActive,
  isSubmenuOpen,
  dictionary,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  isSubmenuOpen: (subItems?: NavMainItem["subItems"]) => boolean;
  dictionary: any;
}) => {
  const { getLocalizedUrl } = useLocalizedRoute();

  const t = (key: string) => {
    if (!key || !key.includes(".") || !dictionary) return key;
    const keys = key.split(".");
    let result: any = dictionary;
    for (const k of keys) {
      if (!result?.[k]) return key;
      result = result[k];
    }
    return typeof result === "string" ? result : key;
  };

  const title = t(item.title);

  return (
    <Collapsible
      key={item.title}
      asChild
      defaultOpen={isSubmenuOpen(item.subItems)}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {item.subItems ? (
            <SidebarMenuButton
              disabled={item.comingSoon}
              isActive={isActive(item.url, item.subItems)}
              tooltip={title}
            >
              {item.icon && <item.icon />}
              <span>{title}</span>
              {item.comingSoon && <IsComingSoon dictionary={dictionary} />}
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
            </SidebarMenuButton>
          ) : (
            <SidebarMenuButton
              asChild
              disabled={item.comingSoon}
              isActive={isActive(item.url)}
              tooltip={title}
            >
              <Link
                prefetch={false}
                href={item.comingSoon ? "#" : getLocalizedUrl(item.url)}
                target={item.newTab ? "_blank" : undefined}
                className={
                  item.comingSoon ? "pointer-events-none opacity-50" : ""
                }
                tabIndex={item.comingSoon ? -1 : undefined}
              >
                {item.icon && <item.icon />}
                <span>{title}</span>
                {item.comingSoon && <IsComingSoon dictionary={dictionary} />}
              </Link>
            </SidebarMenuButton>
          )}
        </CollapsibleTrigger>
        {item.subItems && (
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.subItems.map((subItem) => (
                <SidebarMenuSubItem key={subItem.title}>
                  <SidebarMenuSubButton
                    aria-disabled={subItem.comingSoon}
                    isActive={isActive(subItem.url)}
                    asChild
                  >
                    <Link
                      prefetch={false}
                      href={getLocalizedUrl(subItem.url)}
                      target={subItem.newTab ? "_blank" : undefined}
                    >
                      {subItem.icon && <subItem.icon />}
                      <span>{t(subItem.title)}</span>
                      {subItem.comingSoon && (
                        <IsComingSoon dictionary={dictionary} />
                      )}
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        )}
      </SidebarMenuItem>
    </Collapsible>
  );
};

const NavItemCollapsed = ({
  item,
  isActive,
  dictionary,
}: {
  item: NavMainItem;
  isActive: (url: string, subItems?: NavMainItem["subItems"]) => boolean;
  dictionary: any;
}) => {
  const { getLocalizedUrl } = useLocalizedRoute();

  const t = (key: string) => {
    if (!key || !key.includes(".") || !dictionary) return key;
    const keys = key.split(".");
    let result: any = dictionary;
    for (const k of keys) {
      if (!result?.[k]) return key;
      result = result[k];
    }
    return typeof result === "string" ? result : key;
  };

  const title = t(item.title);

  return (
    <SidebarMenuItem key={item.title}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            disabled={item.comingSoon}
            tooltip={title}
            isActive={isActive(item.url, item.subItems)}
          >
            {item.icon && <item.icon />}
            <span>{title}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-50 space-y-1"
          side="right"
          align="start"
        >
          {item.subItems?.map((subItem) => (
            <DropdownMenuItem key={subItem.title} asChild>
              <SidebarMenuSubButton
                key={subItem.title}
                asChild
                className="focus-visible:ring-0"
                aria-disabled={subItem.comingSoon}
                isActive={isActive(subItem.url)}
              >
                <Link
                  prefetch={false}
                  href={getLocalizedUrl(subItem.url)}
                  target={subItem.newTab ? "_blank" : undefined}
                >
                  {subItem.icon && (
                    <subItem.icon className="[&>svg]:text-sidebar-foreground" />
                  )}
                  <span>{t(subItem.title)}</span>
                  {subItem.comingSoon && (
                    <IsComingSoon dictionary={dictionary} />
                  )}
                </Link>
              </SidebarMenuSubButton>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
};

export function NavMain({ items }: NavMainProps) {
  const path = usePathname();
  const { state, isMobile } = useSidebar();
  const { getLocalizedUrl } = useLocalizedRoute();
  const { dictionary } = useAppStore();

  if (!dictionary) return null;

  const t = (key: string) => {
    if (!key || !key.includes(".") || !dictionary) return key;
    const keys = key.split(".");
    let result: any = dictionary;
    for (const k of keys) {
      if (!result?.[k]) return key;
      result = result[k];
    }
    return typeof result === "string" ? result : key;
  };

  // Strip locale from pathname to match sidebar items
  const activePathSegments = path.split("/").filter(Boolean);
  if (i18n.locales.some((locale) => locale === activePathSegments[0])) {
    activePathSegments.shift();
  }
  const normalizedPath = `/${activePathSegments.join("/")}`;

  const isItemActive = (url: string, subItems?: NavMainItem["subItems"]) => {
    if (subItems?.length) {
      return subItems.some((sub) => normalizedPath.startsWith(sub.url));
    }
    return normalizedPath === url || normalizedPath.startsWith(`${url}/`);
  };

  const isSubmenuOpen = (subItems?: NavMainItem["subItems"]) => {
    return subItems?.some((sub) => normalizedPath.startsWith(sub.url)) ?? false;
  };

  return (
    <>
      {items.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && (
            <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
          )}
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {group.items.map((item) => {
                const title = t(item.title);

                if (state === "collapsed" && !isMobile) {
                  // If no subItems, just render the button as a link
                  if (!item.subItems) {
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          disabled={item.comingSoon}
                          tooltip={title}
                          isActive={isItemActive(item.url)}
                        >
                          <Link
                            prefetch={false}
                            href={
                              item.comingSoon ? "#" : getLocalizedUrl(item.url)
                            }
                            target={item.newTab ? "_blank" : undefined}
                            className={
                              item.comingSoon ? "pointer-events-none opacity-50" : ""
                            }
                            tabIndex={item.comingSoon ? -1 : undefined}
                          >
                            {item.icon && <item.icon />}
                            <span>{title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  // Otherwise, render the dropdown as before
                  return (
                    <NavItemCollapsed
                      key={item.title}
                      item={item}
                      isActive={isItemActive}
                      dictionary={dictionary}
                    />
                  );
                }
                // Expanded view
                return (
                  <NavItemExpanded
                    key={item.title}
                    item={item}
                    isActive={isItemActive}
                    isSubmenuOpen={isSubmenuOpen}
                    dictionary={dictionary}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
