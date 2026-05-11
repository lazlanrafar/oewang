"use client";

import { usePathname } from "next/navigation";

/**
 * Factory function that creates the `useLocalizedRoute` hook for a specific set of locales.
 *
 * Each app has its own `i18n-config.ts` — call this once at the app level and export
 * the resulting hook:
 *
 * ```ts
 * // apps/app/hooks/use-localized-route.ts
 * import { createUseLocalizedRoute } from "@workspace/ui/hooks";
 * import { i18n } from "@/i18n-config";
 * export const useLocalizedRoute = createUseLocalizedRoute(i18n.locales);
 * ```
 */
export function createUseLocalizedRoute(locales: readonly string[]) {
  return function useLocalizedRoute() {
    const pathname = usePathname();

    const currentLocale = locales.find(
      (locale) =>
        pathname && (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`),
    );

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
  };
}
