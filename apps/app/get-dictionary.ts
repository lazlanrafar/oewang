import "server-only";

import type { Locale } from "@/i18n-config";

const dictionaries = {
  en: () => import("@workspace/dictionaries/en").then((module) => module.default),
  ja: () => import("@workspace/dictionaries/ja").then((module) => module.default),
  id: () => import("@workspace/dictionaries/id").then((module) => module.default),
};

import type { Dictionary } from "@workspace/dictionaries";

export const getDictionary = async (locale: Locale): Promise<Dictionary> => 
  (dictionaries[locale]?.() ?? dictionaries.en()) as Promise<Dictionary>;
