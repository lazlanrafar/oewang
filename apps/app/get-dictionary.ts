import "server-only";

import { cache } from "react";

import type { Locale } from "@/i18n-config";

const dictionaries = {
  en: () => import("@workspace/dictionaries/en").then((module) => module.default),
  ja: () => import("@workspace/dictionaries/ja").then((module) => module.default),
  id: () => import("@workspace/dictionaries/id").then((module) => module.default),
};

import type { Dictionary } from "@workspace/dictionaries";

// Wrapped in React cache(): root/dashboard/settings layouts and the page all
// call this in one render pass — cache() collapses them into a single load.
export const getDictionary = cache(
  async (locale: Locale): Promise<Dictionary> => (dictionaries[locale]?.() ?? dictionaries.en()) as Promise<Dictionary>,
);
