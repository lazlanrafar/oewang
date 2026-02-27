"use client";

import { usePathname } from "next/navigation";

import { i18n } from "@/i18n-config";

export function useLocalizedRoute() {
  const pathname = usePathname();

  const currentLocale = i18n.locales.find((locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`);

  const prefix = currentLocale ? `/${currentLocale}` : "";

  const getLocalizedUrl = (url: string) => {
    // If the URL is external or already has the locale, return as is
    if (url.startsWith("http") || url.startsWith(`${prefix}/`)) {
      return url;
    }

    // Ensure url starts with / if not empty
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;

    // Avoid double slashes
    if (prefix === "/" && cleanUrl.startsWith("/")) {
      return cleanUrl;
    }

    return `${prefix}${cleanUrl}`;
  };

  return { getLocalizedUrl, currentLocale };
}
