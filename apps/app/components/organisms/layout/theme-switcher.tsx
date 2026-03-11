"use client";

import { Button } from "@workspace/ui";
import { Monitor, Moon, Sun } from "lucide-react";

import { persistPreference } from "@workspace/ui";
import { usePreferencesStore } from "@workspace/ui";

const THEME_CYCLE = ["light", "dark", "system"] as const;

export function ThemeSwitcher() {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(themeMode);
    const nextTheme = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length] ?? "system";

    setThemeMode(nextTheme);
    persistPreference("theme_mode", nextTheme);
  };

  return (
    <Button size="icon" onClick={cycleTheme} aria-label={`Current theme: ${themeMode}. Click to cycle themes`}>
      {/* SYSTEM */}
      <Monitor className="hidden [html[data-theme-mode=system]_&]:block" />

      {/* DARK (resolved) */}
      <Sun className="hidden dark:block [html[data-theme-mode=system]_&]:hidden" />

      {/* LIGHT (resolved) */}
      <Moon className="block dark:hidden [html[data-theme-mode=system]_&]:hidden" />
    </Button>
  );
}
