"use client";

import { useSyncExternalStore } from "react";

// The real session cookie is httpOnly (invisible to JS). apps/app sets a
// non-httpOnly companion flag `<session>-authed` alongside it; we read that here
// so the marketing pages can stay statically rendered (no server cookies()).
const FLAG_COOKIE = `${
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-session"
}-authed`;

function readFlag(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${FLAG_COOKIE}=`));
}

// Server + first client render return false (matches prerendered HTML), then the
// client corrects after mount — acceptable flash for a marketing CTA.
const subscribe = () => () => undefined;

export function useIsLoggedIn(): boolean {
  return useSyncExternalStore(subscribe, readFlag, () => false);
}
