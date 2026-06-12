import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { match as matchLocale } from "@formatjs/intl-localematcher";
import { jwtVerify } from "jose";
import Negotiator from "negotiator";

import { i18n } from "./i18n-config";

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

async function hasAdminAccess(token: string): Promise<boolean> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return false;
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
    return payload.system_role === "superadmin";
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    ["/manifest.json", "/favicon.ico", "/robots.txt", "/sitemap.xml"].includes(
      pathname,
    )
  )
    return;

  const pathnameIsMissingLocale = i18n.locales.every(
    (locale) =>
      !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
  );

  if (pathnameIsMissingLocale) {
    const locale = getLocale(request);
    const url = new URL(
      `/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`,
      request.url,
    );
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url);
  }

  const locale = pathname.split("/")[1];
  const pathAfterLocale = pathname.replace(`/${locale}`, "") || "/";

  const response = NextResponse.next({ request: { headers: request.headers } });

  const cookieName = process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "oewang-admin-session";
  const token = request.cookies.get(cookieName)?.value;

  const isAuthRoute =
    pathAfterLocale === "/login" ||
    pathAfterLocale === "/register" ||
    pathAfterLocale.startsWith("/api/auth");
  const isUnauthorizedRoute = pathAfterLocale === "/unauthorized";
  const isDashboardRoute = !isAuthRoute && !isUnauthorizedRoute;

  if (isDashboardRoute) {
    if (!token) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
    }

    const isAdmin = await hasAdminAccess(token);
    if (!isAdmin) {
      return NextResponse.redirect(
        new URL(`/${locale}/unauthorized`, request.url),
      );
    }
  }

  if (
    (pathAfterLocale === "/login" || pathAfterLocale === "/register") &&
    token
  ) {
    const isAdmin = await hasAdminAccess(token);
    if (isAdmin) {
      return NextResponse.redirect(new URL(`/${locale}/overview`, request.url));
    }
    return NextResponse.redirect(
      new URL(`/${locale}/unauthorized`, request.url),
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
