"use server";

import { cookies } from "next/headers";

/**
 * Generic server action to set a cookie value.
 * Used for preference persistence within the @workspace/ui package
 * to avoid dependencies on specific applications.
 */
export async function setValueToCookie(
  key: string,
  value: string,
  options: { path?: string; maxAge?: number } = {},
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(key, value, {
    path: options.path ?? "/",
    maxAge: options.maxAge ?? 60 * 60 * 24 * 7, // default: 7 days
  });
}
