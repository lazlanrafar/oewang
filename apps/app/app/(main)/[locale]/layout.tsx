import type { ReactNode } from "react";

import { Toaster } from "@workspace/ui";
import type { Metadata } from "next";

import { Providers } from "@/components/providers/root-provider";
import { APP_CONFIG } from "@workspace/constants";
import { fontRegistry, fontVars } from "@workspace/ui";
import { PREFERENCE_DEFAULTS } from "@workspace/ui";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@workspace/ui";
import { i18n, type Locale } from "@/i18n-config";
import { getDictionary } from "@/get-dictionary";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { getPreference } from "@/server/server-actions";
import {
  THEME_MODE_VALUES,
  THEME_PRESET_VALUES,
  CONTENT_LAYOUT_VALUES,
  NAVBAR_STYLE_VALUES,
  SIDEBAR_VARIANT_VALUES,
  SIDEBAR_COLLAPSIBLE_VALUES,
} from "@workspace/ui";
import "@workspace/ui/globals.css";

const FONT_VALUES_PREF = Object.keys(fontRegistry) as any;
// import { i18n } from "@/i18n-config";

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
};

// export async function generateStaticParams() {
//   return i18n.locales.map((locale) => ({ lang: locale }));
// }

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;

  const [
    theme_mode,
    theme_preset,
    content_layout,
    navbar_style,
    sidebar_variant,
    sidebar_collapsible,
    font,
    dictionary,
  ] = await Promise.all([
    getPreference("theme_mode", THEME_MODE_VALUES, PREFERENCE_DEFAULTS.theme_mode),
    getPreference("theme_preset", THEME_PRESET_VALUES, PREFERENCE_DEFAULTS.theme_preset),
    getPreference("content_layout", CONTENT_LAYOUT_VALUES, PREFERENCE_DEFAULTS.content_layout),
    getPreference("navbar_style", NAVBAR_STYLE_VALUES, PREFERENCE_DEFAULTS.navbar_style),
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, PREFERENCE_DEFAULTS.sidebar_variant),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, PREFERENCE_DEFAULTS.sidebar_collapsible),
    getPreference("font", FONT_VALUES_PREF, PREFERENCE_DEFAULTS.font),
    getDictionary(locale as Locale),
  ]);

  return (
    <html
      lang={locale}
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript />
      </head>
      <body suppressHydrationWarning className={`${fontVars} min-h-screen antialiased`}>
        <PreferencesStoreProvider
          themeMode={theme_mode}
          themePreset={theme_preset}
          contentLayout={content_layout}
          navbarStyle={navbar_style}
          sidebarVariant={sidebar_variant}
          sidebarCollapsible={sidebar_collapsible}
          font={font}
        >
          <NuqsAdapter>
            <Providers dictionary={dictionary}>
              {children}
              <Toaster />
            </Providers>
          </NuqsAdapter>
        </PreferencesStoreProvider>
      </body>
    </html>
  );
}
