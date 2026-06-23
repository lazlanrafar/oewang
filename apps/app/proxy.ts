import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { match as matchLocale } from "@formatjs/intl-localematcher";
import { jwtVerify } from "jose";
import Negotiator from "negotiator";

import { i18n } from "./i18n-config";

const IGNORED_LOCALE_PATHS = [
  "/manifest.json",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/terms",
  "/policy",
  "/sw.js",
  "/workbox-",
];

function getLocale(request: NextRequest): string | undefined {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  // @ts-expect-error locales are readonly
  const locales: string[] = i18n.locales;
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages(locales);

  return matchLocale(languages, locales, i18n.defaultLocale);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (IGNORED_LOCALE_PATHS.some((path) => pathname.startsWith(path))) return;

  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
  );

  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);

    if (pathname.startsWith("/invoice/")) {
      const rewriteUrl = new URL(`/${locale}${pathname}`, request.url);
      rewriteUrl.search = request.nextUrl.search;
      return NextResponse.rewrite(rewriteUrl);
    }

    const url = new URL(`/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  const locale = pathname.split("/")[1];
  const pathAfterLocale = pathname.replace(`/${locale}`, "") || "/";
  const response = NextResponse.next({ request: { headers: request.headers } });

  const token = request.cookies.get("oewang-session")?.value;

  // Routes reachable WITHOUT authentication. Everything else is protected by
  // default (deny-by-default) so newly added dashboard routes are never left
  // silently exposed by forgetting to add them to an allowlist.
  const PUBLIC_PREFIXES = [
    "/login",
    "/register",
    "/accept-invite",
    "/oauth", // OAuth provider callbacks
    "/sync", // post-login session sync
    "/invoice", // public shareable invoice (token-gated by the page itself)
  ];
  const isPublicRoute = PUBLIC_PREFIXES.some((p) => pathAfterLocale === p || pathAfterLocale.startsWith(`${p}/`));

  const isAuthRoute = pathAfterLocale === "/login" || pathAfterLocale === "/register";
  const isCreateWorkspaceRoute = pathAfterLocale === "/create-workspace";

  // Authenticated app area: anything not public and not the workspace-creation
  // step (which needs a token but not yet a workspace_id).
  const isDashboardRoute = !isPublicRoute && !isCreateWorkspaceRoute;
  const isProtectedRoute = isDashboardRoute || isCreateWorkspaceRoute;

  // 1. Auth guard — no token → login
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  // 2. Already authenticated → skip login/register
  if (isAuthRoute && token) {
    return NextResponse.redirect(new URL(`/${locale}/overview`, request.url));
  }

  // 3. Workspace guard — verify JWT and check workspace_id
  if (isDashboardRoute && token) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        const redirectResponse = NextResponse.redirect(new URL(`/${locale}/login`, request.url));
        redirectResponse.cookies.delete("oewang-session");
        return redirectResponse;
      }

      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);

      if (!payload.workspace_id) {
        return NextResponse.redirect(new URL(`/${locale}/create-workspace`, request.url));
      }
    } catch {
      const redirectResponse = NextResponse.redirect(new URL(`/${locale}/login`, request.url));
      redirectResponse.cookies.delete("oewang-session");
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
