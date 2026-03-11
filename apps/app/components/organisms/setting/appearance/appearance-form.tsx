"use client";

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui";

import { type FontKey, fontOptions } from "@workspace/ui";
import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "@workspace/ui";
import {
  applyContentLayout,
  applyFont,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "@workspace/ui";
import { PREFERENCE_DEFAULTS } from "@workspace/ui";
import { persistPreference } from "@workspace/ui";
import { THEME_PRESET_OPTIONS, type ThemeMode, type ThemePreset } from "@workspace/ui";
import { applyThemePreset } from "@workspace/ui";
import { usePreferencesStore } from "@workspace/ui";

interface AppearanceFormProps {
  dictionary: {
    settings: {
      appearance: {
        title: string;
        description: string;
        theme: {
          title: string;
          description: string;
          preset: string;
          mode: string;
          light: string;
          dark: string;
          system: string;
        };
        layout: {
          title: string;
          description: string;
          page_layout: string;
          centered: string;
          full_width: string;
          navbar_behavior: string;
          sticky: string;
          scroll: string;
        };
        sidebar: {
          title: string;
          description: string;
          style: string;
          inset: string;
          sidebar: string;
          floating: string;
          collapse_mode: string;
          icon: string;
          offcanvas: string;
        };
        typography: {
          title: string;
          description: string;
          font_family: string;
        };
        restore_defaults: string;
      };
    };
  };
}

export function AppearanceForm({ dictionary }: AppearanceFormProps) {
  const { appearance } = dictionary.settings;
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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{appearance.title}</h3>
        <p className="text-sm text-muted-foreground">{appearance.description}</p>
      </div>
      <Separator />

      {/* Theme Settings */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">{appearance.theme.title}</h4>
          <p className="text-sm text-muted-foreground">{appearance.theme.description}</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{appearance.theme.preset}</Label>
            <Select value={themePreset} onValueChange={onThemePresetChange}>
              <SelectTrigger className="w-full md:w-[240px]">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                {THEME_PRESET_OPTIONS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-4 rounded-full"
                        style={{
                          backgroundColor:
                            (resolvedThemeMode ?? "light") === "dark" ? preset.primary.dark : preset.primary.light,
                        }}
                      />
                      {preset.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{appearance.theme.mode}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={themeMode}
              onValueChange={onThemeModeChange}
              className="justify-start"
            >
              <ToggleGroupItem value="light" aria-label="Toggle light">
                {appearance.theme.light}
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" aria-label="Toggle dark">
                {appearance.theme.dark}
              </ToggleGroupItem>
              <ToggleGroupItem value="system" aria-label="Toggle system">
                {appearance.theme.system}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
      <Separator />

      {/* Layout Settings */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">{appearance.layout.title}</h4>
          <p className="text-sm text-muted-foreground">{appearance.layout.description}</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{appearance.layout.page_layout}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={contentLayout}
              onValueChange={onContentLayoutChange}
              className="justify-start"
            >
              <ToggleGroupItem value="centered" aria-label="Toggle centered">
                {appearance.layout.centered}
              </ToggleGroupItem>
              <ToggleGroupItem value="full-width" aria-label="Toggle full-width">
                {appearance.layout.full_width}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>{appearance.layout.navbar_behavior}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={navbarStyle}
              onValueChange={onNavbarStyleChange}
              className="justify-start"
            >
              <ToggleGroupItem value="sticky" aria-label="Toggle sticky">
                {appearance.layout.sticky}
              </ToggleGroupItem>
              <ToggleGroupItem value="scroll" aria-label="Toggle scroll">
                {appearance.layout.scroll}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
      <Separator />

      {/* Sidebar Settings */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">{appearance.sidebar.title}</h4>
          <p className="text-sm text-muted-foreground">{appearance.sidebar.description}</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{appearance.sidebar.style}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={variant}
              onValueChange={onSidebarStyleChange}
              className="justify-start"
            >
              <ToggleGroupItem value="inset" aria-label="Toggle inset">
                {appearance.sidebar.inset}
              </ToggleGroupItem>
              <ToggleGroupItem value="sidebar" aria-label="Toggle sidebar">
                {appearance.sidebar.sidebar}
              </ToggleGroupItem>
              <ToggleGroupItem value="floating" aria-label="Toggle floating">
                {appearance.sidebar.floating}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <Label>{appearance.sidebar.collapse_mode}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={collapsible}
              onValueChange={onSidebarCollapseModeChange}
              className="justify-start"
            >
              <ToggleGroupItem value="icon" aria-label="Toggle icon">
                {appearance.sidebar.icon}
              </ToggleGroupItem>
              <ToggleGroupItem value="offcanvas" aria-label="Toggle offcanvas">
                {appearance.sidebar.offcanvas}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
      <Separator />

      {/* Typography */}
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">{appearance.typography.title}</h4>
          <p className="text-sm text-muted-foreground">{appearance.typography.description}</p>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{appearance.typography.font_family}</Label>
            <Select value={font} onValueChange={onFontChange}>
              <SelectTrigger className="w-full md:w-[240px]">
                <SelectValue placeholder="Select font" />
              </SelectTrigger>
              <SelectContent>
                {fontOptions.map((font) => (
                  <SelectItem key={font.key} value={font.key}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-4">
            <Button type="button" variant="destructive" onClick={handleRestore}>
              {appearance.restore_defaults}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
