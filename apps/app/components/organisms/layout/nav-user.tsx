"use client";

import { useRouter } from "next/navigation";

import { logout } from "@workspace/modules/auth/auth.action";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  getInitials,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui";
import { CircleUser, CreditCard, EllipsisVertical, LogOut, MessageSquareDot } from "lucide-react";

import { type AppDictionary, getDictionaryText } from "@/modules/types/dictionary";
import { useLocalizedRoute } from "@/utils/localized-route";

export function NavUser({
  user,
  dictionary,
}: {
  readonly user: {
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
  };
  readonly dictionary: AppDictionary;
}) {
  const { isMobile } = useSidebar();
  const { getLocalizedUrl } = useLocalizedRoute();
  const router = useRouter();

  const t = (key: string) => getDictionaryText(dictionary, key);

  const handleNavigate = (path: string) => {
    router.push(getLocalizedUrl(path));
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg grayscale">
                <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
                <AvatarFallback className="rounded-lg">{getInitials(user?.name)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user?.name}</span>
                <span className="truncate text-muted-foreground text-xs">{user?.email}</span>
              </span>
              <EllipsisVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
                  <AvatarFallback className="rounded-lg">{getInitials(user?.name)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user?.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{user?.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => handleNavigate("/settings/profile")}>
                <CircleUser />
                {t("sidebar.account_label")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleNavigate("/settings/billing")}>
                <CreditCard />
                {t("sidebar.billing_label")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleNavigate("/settings/notifications")}>
                <MessageSquareDot />
                {t("sidebar.notifications_label")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut />
              {t("sidebar.logout_label")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
