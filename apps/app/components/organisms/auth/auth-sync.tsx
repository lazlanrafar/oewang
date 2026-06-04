"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface AuthSyncProps {
  locale: string;
  returnTo?: string;
}

/**
 * Minimal sync page — no Supabase. If the user landed here they either have
 * no session (→ login) or a valid JWT (→ overview). The middleware workspace
 * guard handles the redirect logic; this component is just a loading screen
 * for the brief moment before the middleware redirect resolves.
 */
export function AuthSync({ locale, returnTo = "/overview" }: AuthSyncProps) {
  const router = useRouter();

  useEffect(() => {
    // Check for oewang-session cookie client-side.
    const hasSession = document.cookie
      .split(";")
      .some((c) => c.trim().startsWith("oewang-session="));

    if (hasSession) {
      router.replace(`/${locale}${returnTo}`);
    } else {
      router.replace(`/${locale}/login`);
    }
  }, [locale, router, returnTo]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4 p-6 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">Redirecting…</p>
    </div>
  );
}
