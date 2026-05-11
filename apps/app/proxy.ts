import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { match as matchLocale } from "@formatjs/intl-localematcher";
import { createMiddlewareClient } from "@workspace/supabase/middleware";
import { jwtVerify } from "jose";
import Negotiator from "negotiator";

import { i18n } from "./i18n-config";

const IGNORED_LOCALE_PATHS = ["/manifest.json", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/terms", "/policy"];

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

  // Ignore static assets and ignored paths
  if (IGNORED_LOCALE_PATHS.some((path) => pathname.startsWith(path))) return;

  // Check if there is any supported locale in the pathname
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
  );

  // Redirect or Rewrite if there is no locale
  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);

    // Support short sharing links for invoices via rewrite
    if (pathname.startsWith("/invoice/")) {
      const rewriteUrl = new URL(`/${locale}${pathname}`, request.url);
      rewriteUrl.search = request.nextUrl.search;
      return NextResponse.rewrite(rewriteUrl);
    }

    const url = new URL(`/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  // Extract locale from the path
  const locale = pathname.split("/")[1];

  // Calculate specific path after locale
  const pathAfterLocale = pathname.replace(`/${locale}`, "") || "/";

  // Supabase Auth Logic
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createMiddlewareClient(request, response);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Get app session from cookie
  const token = request.cookies.get("oewang-session")?.value;

  const isDashboardRoute =
    pathAfterLocale.startsWith("/overview") ||
    pathAfterLocale.startsWith("/budget") ||
    pathAfterLocale.startsWith("/transactions") ||
    pathAfterLocale.startsWith("/accounts") ||
    pathAfterLocale.startsWith("/calendar") ||
    pathAfterLocale.startsWith("/settings") ||
    pathAfterLocale.startsWith("/contacts") ||
    pathAfterLocale.startsWith("/vault");

  const isAuthRoute = pathAfterLocale === "/login" || pathAfterLocale === "/register";
  const isSyncRoute = pathAfterLocale === "/sync";
  const isCreateWorkspaceRoute = pathAfterLocale === "/create-workspace";
  const isProtectedRoute = isDashboardRoute || isSyncRoute || isCreateWorkspaceRoute;

  // 1. Auth Guard
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  if (isAuthRoute && session) {
    // Supabase session exists but app JWT is missing/expired.
    // Route to sync to mint a fresh app session cookie and avoid redirect loops.
    if (!token) {
      return NextResponse.redirect(new URL(`/${locale}/sync`, request.url));
    }
    return NextResponse.redirect(new URL(`/${locale}/overview`, request.url));
  }

  if (isDashboardRoute && session && !token) {
    return NextResponse.redirect(new URL(`/${locale}/sync`, request.url));
  }

  // 2. Workspace Guard (Lightweight JWT check)
  if (isDashboardRoute && token) {
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("[Proxy] Missing JWT_SECRET. Refusing to verify session.");
        const redirectResponse = NextResponse.redirect(new URL(`/${locale}/login`, request.url));
        redirectResponse.cookies.delete("oewang-session");
        return redirectResponse;
      }

      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);

      if (
        !payload.workspace_id &&
        !pathAfterLocale.startsWith("/sync") &&
        !pathAfterLocale.startsWith("/create-workspace")
      ) {
        return NextResponse.redirect(new URL(`/${locale}/sync`, request.url));
      }
    } catch (e) {
      console.error("[Proxy] JWT verification failed:", e);
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
