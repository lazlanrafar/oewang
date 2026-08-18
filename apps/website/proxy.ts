import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { match as matchLocale } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

import { i18n } from "./i18n-config";

const IGNORED_LOCALE_PATHS = ["/manifest.json", "/favicon.ico", "/robots.txt", "/sitemap.xml"];

function getLocale(request: NextRequest): string | undefined {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  const rawLanguages = new Negotiator({
    headers: negotiatorHeaders,
  }).languages();
  const normalizedLanguages = rawLanguages.map((lang) => {
    const lower = lang.toLowerCase();
    if (lower.startsWith("id")) return "id";
    if (lower.startsWith("ja") || lower.startsWith("jp")) return "ja";
    return "en";
  });

  // @ts-expect-error locales are readonly
  const locales: string[] = i18n.locales;
  return matchLocale(normalizedLanguages, locales, i18n.defaultLocale);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (IGNORED_LOCALE_PATHS.some((path) => pathname.startsWith(path))) return;

  if (pathname === "/jp" || pathname.startsWith("/jp/")) {
    const normalized = pathname.replace(/^\/jp(?=\/|$)/, "/ja");
    const url = new URL(normalized, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
  );

  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);
    const url = new URL(`/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  const locale = pathname.split("/")[1];
  const pathAfterLocale = pathname.replace(`/${locale}`, "") || "/";

  const response = NextResponse.next({ request: { headers: request.headers } });

  const token = request.cookies.get("oewang-session")?.value;

  // Protect any dashboard-adjacent pages on the website
  if (pathAfterLocale.startsWith("/overview")) {
    if (!token) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  if (pathAfterLocale.startsWith("/create-workspace") && !token) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  if ((pathAfterLocale === "/login" || pathAfterLocale === "/register") && token) {
    return NextResponse.redirect(new URL(`/${locale}/overview`, request.url));
  }

  return response;
}

export const config = {
  // Exclude API, Next internals, and any static file (paths containing a dot,
  // e.g. /iphone.svg, /logo.png) so public assets aren't locale-redirected.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
