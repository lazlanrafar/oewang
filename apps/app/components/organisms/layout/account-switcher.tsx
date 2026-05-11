"use client";

import { logout } from "@workspace/modules/auth/auth.action";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  getInitials,
  persistPreference,
  usePreferencesStore,
} from "@workspace/ui";
import { Check, LogOut, Monitor, Moon, Sun } from "lucide-react";

import type { AppDictionary } from "@/modules/types/dictionary";

export function AccountSwitcher({
  user,
  dictionary,
}: {
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly avatar: string;
  };
  readonly dictionary: AppDictionary;
}) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const handleThemeChange = (theme: "light" | "dark" | "system") => {
    setThemeMode(theme);
    persistPreference("theme_mode", theme);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="size-9 cursor-pointer rounded-full">
          <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
          <AvatarFallback className="rounded-full text-xs">{getInitials(user?.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <div className="flex w-full items-center gap-2 px-2 py-2">
          {/* <Avatar className="size-9 rounded-lg">
            <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
            <AvatarFallback className="rounded-lg">
              {getInitials(user?.name)}
            </AvatarFallback>
          </Avatar> */}
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{user?.name}</span>
            <span className="truncate text-muted-foreground text-xs">{user?.email}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        {/* <DropdownMenuGroup>
          <DropdownMenuItem>
            <BadgeCheck />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup> */}
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Sun className="dark:hidden" />
              <Moon className="hidden dark:block" />
              {dictionary.settings.appearance.theme.title || "Theme"}
              <span className="ml-auto text-muted-foreground text-xs capitalize">
                {dictionary.settings.appearance.theme[themeMode] || themeMode}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-32">
              <DropdownMenuItem onClick={() => handleThemeChange("light")}>
                <Sun />
                {dictionary.settings.appearance.theme.light || "Light"}
                {themeMode === "light" && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleThemeChange("dark")}>
                <Moon />
                {dictionary.settings.appearance.theme.dark || "Dark"}
                {themeMode === "dark" && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleThemeChange("system")}>
                <Monitor />
                {dictionary.settings.appearance.theme.system || "System"}
                {themeMode === "system" && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red" onClick={() => logout()}>
          <LogOut className="text-red" />
          {dictionary.sidebar.logout_label || "Log out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
