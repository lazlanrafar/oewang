"use client";

import { usePathname, useRouter } from "next/navigation";

import { updateAgentResponseLanguageAction } from "@workspace/modules/ai/ai.action";
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
import { Check, CircleUser, CreditCard, Globe, LogOut, MessageSquareDot, Monitor, Moon, Sun } from "lucide-react";

import type { AppDictionary } from "@/modules/types/dictionary";
import { useLocalizedRoute } from "@/utils/localized-route";

// ponytail: mirrors language-settings-form; keep in sync if more locales gain a response language
const LOCALE_TO_RESPONSE_LANGUAGE: Record<string, string> = {
  en: "english",
  id: "indonesian",
};

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
  const router = useRouter();
  const pathname = usePathname();
  const { getLocalizedUrl } = useLocalizedRoute();

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const currentLocale = pathname.split("/")[1] ?? "";
  const languageOptions = dictionary.settings.language.options as Record<string, string>;

  const handleThemeChange = (theme: "light" | "dark" | "system") => {
    setThemeMode(theme);
    persistPreference("theme_mode", theme);
  };

  const handleLanguageChange = (newLocale: string) => {
    if (newLocale === currentLocale) return;
    updateAgentResponseLanguageAction(LOCALE_TO_RESPONSE_LANGUAGE[newLocale] ?? "auto");
    const segments = pathname.split("/");
    segments[1] = newLocale;
    router.push(segments.join("/"));
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
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{user?.name}</span>
            <span className="truncate text-muted-foreground text-xs">{user?.email}</span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => router.push(getLocalizedUrl("/settings/profile"))}>
            <CircleUser />
            {dictionary.sidebar.account_label || "Account"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(getLocalizedUrl("/settings/billing"))}>
            <CreditCard />
            {dictionary.sidebar.billing_label || "Billing"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(getLocalizedUrl("/settings/notifications"))}>
            <MessageSquareDot />
            {dictionary.sidebar.notifications_label || "Notifications"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe />
              {dictionary.settings.language.title || "Language"}
              <span className="ml-auto text-muted-foreground text-xs">{languageOptions[currentLocale]}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-32">
              {Object.entries(languageOptions).map(([value, label]) => (
                <DropdownMenuItem key={value} onClick={() => handleLanguageChange(value)}>
                  {label}
                  {currentLocale === value && <Check className="ml-auto size-4" />}
                </DropdownMenuItem>
              ))}
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
