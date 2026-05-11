"use client";
import * as React from "react";

import type { Dictionary } from "@workspace/dictionaries";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "@workspace/ui";
import {
  applyContentLayout,
  applyFont,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
  applyThemePreset,
  Button,
  type FontKey,
  fontOptions,
  Label,
  PREFERENCE_DEFAULTS,
  persistPreference,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  THEME_PRESET_OPTIONS,
  type ThemeMode,
  type ThemePreset,
  ToggleGroup,
  ToggleGroupItem,
  usePreferencesStore,
} from "@workspace/ui";

function SettingAppearanceSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Separator className="" />

      <div className="space-y-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-4">
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-full max-w-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-10 w-full max-w-md" />
              </div>
            </div>
            {i < 4 && <Separator className="" />}
          </div>
        ))}
      </div>
    </div>
  );
}

interface AppearanceFormProps {
  dictionary: Dictionary;
}

export function AppearanceForm({ dictionary }: AppearanceFormProps) {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const themePreset = usePreferencesStore((s) => s.themePreset);
  const setThemePreset = usePreferencesStore((s) => s.setThemePreset);
  const contentLayout = usePreferencesStore((s) => s.contentLayout);
  const setContentLayout = usePreferencesStore((s) => s.setContentLayout);
  const navbarStyle = usePreferencesStore((s) => s.navbarStyle);
  const setNavbarStyle = usePreferencesStore((s) => s.setNavbarStyle);
  const variant = usePreferencesStore((s) => s.sidebarVariant);
  const setSidebarVariant = usePreferencesStore((s) => s.setSidebarVariant);
  const collapsible = usePreferencesStore((s) => s.sidebarCollapsible);
  const setSidebarCollapsible = usePreferencesStore((s) => s.setSidebarCollapsible);
  const font = usePreferencesStore((s) => s.font);
  const setFont = usePreferencesStore((s) => s.setFont);

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!dictionary || !mounted) {
    return <SettingAppearanceSkeleton />;
  }

  const { appearance } = dictionary.settings;

  const onThemePresetChange = (preset: ThemePreset) => {
    applyThemePreset(preset);
    setThemePreset(preset);
    persistPreference("theme_preset", preset);
  };

  const onThemeModeChange = (mode: ThemeMode | "") => {
    if (!mode) return;
    setThemeMode(mode);
    persistPreference("theme_mode", mode);
  };

  const onContentLayoutChange = (layout: ContentLayout | "") => {
    if (!layout) return;
    applyContentLayout(layout);
    setContentLayout(layout);
    persistPreference("content_layout", layout);
  };

  const onNavbarStyleChange = (style: NavbarStyle | "") => {
    if (!style) return;
    applyNavbarStyle(style);
    setNavbarStyle(style);
    persistPreference("navbar_style", style);
  };

  const onSidebarStyleChange = (value: SidebarVariant | "") => {
    if (!value) return;
    setSidebarVariant(value);
    applySidebarVariant(value);
    persistPreference("sidebar_variant", value);
  };

  const onSidebarCollapseModeChange = (value: SidebarCollapsible | "") => {
    if (!value) return;
    setSidebarCollapsible(value);
    applySidebarCollapsible(value);
    persistPreference("sidebar_collapsible", value);
  };

  const onFontChange = (value: FontKey | "") => {
    if (!value) return;
    applyFont(value);
    setFont(value);
    persistPreference("font", value);
  };

  const handleRestore = () => {
    onThemePresetChange(PREFERENCE_DEFAULTS.theme_preset);
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode);
    onContentLayoutChange(PREFERENCE_DEFAULTS.content_layout);
    onNavbarStyleChange(PREFERENCE_DEFAULTS.navbar_style);
    onSidebarStyleChange(PREFERENCE_DEFAULTS.sidebar_variant);
    onSidebarCollapseModeChange(PREFERENCE_DEFAULTS.sidebar_collapsible);
    onFontChange(PREFERENCE_DEFAULTS.font);
  };

  return (
    <div className="space-y-8 pb-10 focus:outline-none">
      <div className="space-y-1">
        <h2 className="font-medium text-lg tracking-tight">{appearance.title}</h2>
        <p className="text-muted-foreground text-xs">{appearance.description}</p>
      </div>
      <Separator className="" />

      <div className="space-y-10">
        {/* Theme Settings */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-medium text-sm tracking-tight">{appearance.theme.title}</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{appearance.theme.description}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.theme.preset}
              </Label>
              <Select value={themePreset} onValueChange={onThemePresetChange}>
                <SelectTrigger className="h-8 w-full border bg-background font-normal text-xs transition-colors hover:bg-accent/5">
                  <SelectValue placeholder={appearance.theme.preset_placeholder} />
                </SelectTrigger>
                <SelectContent className="border bg-background p-0">
                  {THEME_PRESET_OPTIONS.map((preset) => (
                    <SelectItem
                      key={preset.value}
                      value={preset.value}
                      className="cursor-pointer px-2 py-1.5 text-xs focus:bg-accent focus:text-accent-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 ring-1 ring-border/50"
                          style={{
                            backgroundColor:
                              (resolvedThemeMode ?? "light") === "dark" ? preset.primary.dark : preset.primary.light,
                          }}
                        />
                        <span className="text-[11px]">{preset.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.theme.mode}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={themeMode}
                onValueChange={onThemeModeChange}
                className="justify-start gap-0"
              >
                <ToggleGroupItem
                  value="light"
                  aria-label="Toggle light"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.theme.light}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="dark"
                  aria-label="Toggle dark"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.theme.dark}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="system"
                  aria-label="Toggle system"
                  className="h-8 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.theme.system}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </section>

        <Separator className="opacity-50" />

        {/* Layout Settings */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-medium text-sm tracking-tight">{appearance.layout.title}</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{appearance.layout.description}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.layout.page_layout}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={contentLayout}
                onValueChange={onContentLayoutChange}
                className="justify-start gap-0"
              >
                <ToggleGroupItem
                  value="centered"
                  aria-label="Toggle centered"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.layout.centered}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="full-width"
                  aria-label="Toggle full-width"
                  className="h-8 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.layout.full_width}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.layout.navbar_behavior}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={navbarStyle}
                onValueChange={onNavbarStyleChange}
                className="justify-start gap-0"
              >
                <ToggleGroupItem
                  value="sticky"
                  aria-label="Toggle sticky"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.layout.sticky}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="scroll"
                  aria-label="Toggle scroll"
                  className="h-8 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.layout.scroll}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </section>

        <Separator className="opacity-50" />

        {/* Sidebar Settings */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-medium text-sm tracking-tight">{appearance.sidebar.title}</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{appearance.sidebar.description}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.sidebar.style}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={variant}
                onValueChange={onSidebarStyleChange}
                className="justify-start gap-0"
              >
                <ToggleGroupItem
                  value="inset"
                  aria-label="Toggle inset"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.sidebar.inset}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="sidebar"
                  aria-label="Toggle sidebar"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.sidebar.sidebar}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="floating"
                  aria-label="Toggle floating"
                  className="h-8 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.sidebar.floating}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.sidebar.collapse_mode}
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={collapsible}
                onValueChange={onSidebarCollapseModeChange}
                className="justify-start gap-0"
              >
                <ToggleGroupItem
                  value="icon"
                  aria-label="Toggle icon"
                  className="h-8 border-r-0 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.sidebar.icon}
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="offcanvas"
                  aria-label="Toggle offcanvas"
                  className="h-8 px-3.5 font-normal text-[11px] data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                >
                  {appearance.sidebar.offcanvas}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </section>

        <Separator className="opacity-50" />

        {/* Typography */}
        <section className="space-y-6">
          <div className="space-y-1">
            <h3 className="font-medium text-sm tracking-tight">{appearance.typography.title}</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{appearance.typography.description}</p>
          </div>
          <div className="grid items-end gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="px-0.5 font-semibold text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                {appearance.typography.font_family}
              </Label>
              <Select value={font} onValueChange={onFontChange}>
                <SelectTrigger className="h-8 w-full border bg-background font-normal text-xs transition-colors hover:bg-accent/5">
                  <SelectValue placeholder={appearance.typography.font_placeholder} />
                </SelectTrigger>
                <SelectContent className="border bg-background p-0">
                  {fontOptions.map((font) => (
                    <SelectItem
                      key={font.key}
                      value={font.key}
                      className="cursor-pointer px-2 py-1.5 text-xs focus:bg-accent focus:text-accent-foreground"
                    >
                      <span className="text-[11px]">{font.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex sm:justify-start">
              <Button
                type="button"
                variant="destructive"
                onClick={handleRestore}
                className="h-8 px-4 font-normal text-[11px] opacity-90 transition-opacity hover:opacity-100"
              >
                {appearance.restore_defaults}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
