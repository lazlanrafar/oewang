import type { WebsiteDictionary } from "./website-en";
import { websiteEn } from "./website-en";
import { websiteId } from "./website-id";
import { websiteJa } from "./website-ja";

export const dictionaries = {
  en: websiteEn,
  ja: websiteJa,
  id: websiteId,
};

export function getDictionary(locale: string): WebsiteDictionary {
  return dictionaries[locale as keyof typeof dictionaries] ?? dictionaries.en;
}

export type { WebsiteDictionary };
