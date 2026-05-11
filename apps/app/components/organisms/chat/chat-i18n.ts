export function getDictionaryText(
  dictionary: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  if (!dictionary || !key.includes(".")) {
    return applyParams(fallback, params);
  }

  const path = key.split(".");
  let value: unknown = dictionary;

  for (const segment of path) {
    if (!value || typeof value !== "object" || !(segment in value)) {
      return applyParams(fallback, params);
    }
    value = (value as Record<string, unknown>)[segment];
  }

  if (typeof value !== "string") {
    return applyParams(fallback, params);
  }

  return applyParams(value, params);
}

function applyParams(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}
