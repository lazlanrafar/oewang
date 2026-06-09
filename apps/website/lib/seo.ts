import { WEBSITE_CONFIG } from "@workspace/constants";
import type { Metadata } from "next";

import { i18n } from "@/i18n-config";

type Locale = (typeof i18n.locales)[number];

type PageSeoOptions = {
  locale: string;
  path: string;
  title: string;
  description: string;
  keywords?: string[];
  type?: "website" | "article";
};

export function getLocalizedPath(locale: string, path = ""): string {
  const normalizedPath = path === "/" ? "" : path;
  if (locale === i18n.defaultLocale && !normalizedPath) return "/";
  return `/${locale}${normalizedPath}`;
}

export function getPageUrl(locale: string, path = ""): string {
  const localizedPath = getLocalizedPath(locale, path);
  return localizedPath === "/" ? WEBSITE_CONFIG.url : `${WEBSITE_CONFIG.url}${localizedPath}`;
}

export function getLanguageAlternates(path = ""): Record<string, string> {
  return Object.fromEntries(i18n.locales.map((locale: Locale) => [locale, getPageUrl(locale, path)]));
}

export function createPageMetadata({
  locale,
  path,
  title,
  description,
  keywords,
  type = "website",
}: PageSeoOptions): Metadata {
  const url = getPageUrl(locale, path);
  const fullTitle = title.includes("Oewang") ? title : `${title} – Oewang`;

  return {
    title: fullTitle,
    description,
    keywords,
    alternates: {
      canonical: url,
      languages: getLanguageAlternates(path),
    },
    openGraph: {
      ...WEBSITE_CONFIG.meta.og,
      title: fullTitle,
      description,
      type,
      url,
      locale: locale === "ja" ? "ja_JP" : locale === "id" ? "id_ID" : "en_US",
      images: [...WEBSITE_CONFIG.meta.og.images],
    },
    twitter: {
      ...WEBSITE_CONFIG.meta.twitter,
      title: fullTitle,
      description,
      images: [...WEBSITE_CONFIG.meta.twitter.images],
    },
  };
}
