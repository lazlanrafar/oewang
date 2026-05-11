import type { Dictionary } from "@workspace/dictionaries";

export type AppDictionary = Dictionary;
type DictionaryValue = string | number | boolean | null | undefined | DictionaryObject | DictionaryValue[];
interface DictionaryObject {
  [key: string]: DictionaryValue;
}

export function getDictionaryValue(
  dictionary: AppDictionary | null | undefined,
  key: string,
): DictionaryValue | undefined {
  if (!dictionary || !key || !key.includes(".")) {
    return undefined;
  }

  const parts = key.split(".");
  let current: unknown = dictionary;

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current as DictionaryValue;
}

export function getDictionaryText(
  dictionary: AppDictionary | null | undefined,
  key: string,
  fallback = key,
  variables?: Record<string, string | number>,
): string {
  const value = getDictionaryValue(dictionary, key);
  if (typeof value !== "string") {
    return fallback;
  }

  if (!variables) {
    return value;
  }

  let output = value;
  for (const [name, tokenValue] of Object.entries(variables)) {
    output = output.replace(`{${name}}`, String(tokenValue));
  }
  return output;
}
