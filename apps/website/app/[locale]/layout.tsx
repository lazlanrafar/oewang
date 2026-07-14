import type { ReactNode } from "react";

import { fontVars } from "@workspace/ui";
import { Toaster } from "@workspace/ui/atoms";
import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import "@workspace/ui/globals.css";
import "@/app/marketing-theme.css";

import { WEBSITE_CONFIG } from "@workspace/constants";

import { i18n } from "@/i18n-config";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const baseUrl = WEBSITE_CONFIG.url;

  return {
    title: {
      default: WEBSITE_CONFIG.meta.title,
      template: `%s | ${WEBSITE_CONFIG.name}`,
    },
    description: WEBSITE_CONFIG.meta.description,
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: locale === i18n.defaultLocale ? "/" : `/${locale}`,
      languages: Object.fromEntries(i18n.locales.map((l) => [l, l === i18n.defaultLocale ? "/" : `/${l}`])),
    },
    openGraph: {
      ...WEBSITE_CONFIG.meta.og,
      url: `${baseUrl}/${locale}`,
      locale: locale === "en" ? "en_US" : locale === "ja" ? "ja_JP" : "id_ID",
      images: [...WEBSITE_CONFIG.meta.og.images],
    },
    twitter: {
      ...WEBSITE_CONFIG.meta.twitter,
      images: [...WEBSITE_CONFIG.meta.twitter.images],
    },
    icons: {
      icon: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>) {
  const { locale } = await params;

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Mark JS present before first paint so reveal headlines only hide when
            they can actually be animated back in (no-JS keeps them visible). */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: tiny synchronous no-flash bootstrap
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
