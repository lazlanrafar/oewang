import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { match as matchLocale } from "@formatjs/intl-localematcher";
import { createMiddlewareClient } from "@workspace/supabase/middleware";
import Negotiator from "negotiator";

import { i18n } from "./i18n-config";

const IGNORED_LOCALE_PATHS = [
  "/manifest.json",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/terms",
  "/policy",
];

function getLocale(request: NextRequest): string | undefined {
  const negotiatorHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    negotiatorHeaders[key] = value;
  });

  // @ts-expect-error locales are readonly
  const locales: string[] = i18n.locales;
  const languages = new Negotiator({ headers: negotiatorHeaders }).languages(
    locales,
  );

  return matchLocale(languages, locales, i18n.defaultLocale);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Ignore static assets and ignored paths
  if (IGNORED_LOCALE_PATHS.some((path) => pathname.startsWith(path))) return;

  // Check if there is any supported locale in the pathname
  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) =>
      !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
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

    const url = new URL(
      `/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`,
      request.url,
    );
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  // Extract locale from the path
  // Assumes path starts with /<locale>
  const locale = pathname.split("/")[1];

  // Calculate specific path after locale
  // e.g. /en/overview -> /overview
  // e.g. /en -> /
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
  const oewang_session = request.cookies.get("oewang-session")?.value;

  // Protect dashboard routes
  if (pathAfterLocale.startsWith("/overview")) {
    if (!session) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
    if (!oewang_session) {
      return NextResponse.redirect(new URL(`/${locale}/sync`, request.url));
    }

    // Optional: Redirect if workspace_id is missing in JWT (handled by API, but we could enforce it here)
  }

  // Protect create-workspace (must be logged in)
  if (pathAfterLocale.startsWith("/create-workspace")) {
    if (!session) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }
  }

  // Redirect to dashboard or onboarding if logged in and on login/register pages
  if (
    (pathAfterLocale === "/login" || pathAfterLocale === "/register") &&
    session
  ) {
    if (oewang_session) {
      return NextResponse.redirect(new URL(`/${locale}/overview`, request.url));
    } else {
      return NextResponse.redirect(new URL(`/${locale}/sync`, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
