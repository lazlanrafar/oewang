import type { ReactNode } from "react";

import { Toaster } from "@workspace/ui";
import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { ADMIN_CONFIG as APP_CONFIG } from "@workspace/constants";
import { fontVars } from "@workspace/ui";
import { PREFERENCE_DEFAULTS } from "@workspace/ui";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@workspace/ui";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import "@workspace/ui/globals.css";
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

  const {
    theme_mode,
    theme_preset,
    content_layout,
    navbar_style,
    sidebar_variant,
    sidebar_collapsible,
    font,
  } = PREFERENCE_DEFAULTS;

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
      <body className={`${fontVars} min-h-screen antialiased`}>
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
            <Providers>
              {children}
              <Toaster />
            </Providers>
          </NuqsAdapter>
        </PreferencesStoreProvider>
      </body>
    </html>
  );
}
