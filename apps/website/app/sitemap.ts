import { WEBSITE_CONFIG } from "@workspace/constants";
import type { MetadataRoute } from "next";

import { i18n } from "../i18n-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = WEBSITE_CONFIG.url;
  const routes = ["", "/terms", "/policy"];

  const sitemapItems: MetadataRoute.Sitemap = [];

  for (const route of routes) {
    for (const locale of i18n.locales) {
      const isDefault = locale === i18n.defaultLocale;
      const url = isDefault && route === "" ? baseUrl : `${baseUrl}/${locale}${route}`;
      const priority = route === "" ? 1 : 0.7;

      sitemapItems.push({
        url,
        lastModified: new Date(),
        changeFrequency: route === "" ? "weekly" : "monthly",
        priority,
      });
    }
  }

  return sitemapItems;
}
