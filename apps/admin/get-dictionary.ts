import "server-only";

import type { Locale } from "@/i18n-config";

const dictionaries = {
  en: () => import("@workspace/dictionaries/en").then((module) => module.default),
  ja: () => import("@workspace/dictionaries/ja").then((module) => module.default),
  id: () => import("@workspace/dictionaries/id").then((module) => module.default),
};

export const getDictionary = async (locale: Locale) => dictionaries[locale]?.() ?? dictionaries.en();
