"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { exchangeSupabaseToken } from "@workspace/modules/server";
import { createBrowserClient } from "@workspace/supabase/client";
import { Loader2 } from "lucide-react";

interface AuthSyncProps {
  locale: string;
  returnTo?: string;
}

export function AuthSync({ locale, returnTo = "/overview" }: AuthSyncProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "syncing" | "error">("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const performSync = async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          router.push(`/${locale}/login`);
          return;
        }

        // 1. Direct Exchange (faster, avoids redundant syncUser)
        setStatus("syncing");
        const exchangeResult = await exchangeSupabaseToken(session.access_token);

        if (!exchangeResult.success || !exchangeResult.data) {
          setStatus("error");
          setErrorMsg(exchangeResult.error || "Failed to refresh session.");
          return;
        }

        // 2. Check if we have a workspace
        if (!exchangeResult.data.workspace_id) {
          router.push(`/${locale}/create-workspace`);
          return;
        }

        // 3. Perfect! Redirect to target
        router.push(`/${locale}${returnTo}`);
      } catch (err: unknown) {
        console.error("Auth sync error:", err);
        setStatus("error");
        setErrorMsg(err.message || "An unexpected error occurred.");
      }
    };

    performSync();
  }, [locale, router, returnTo]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4 p-6 text-center">
      {status !== "error" ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="space-y-2">
            <h2 className="font-medium text-xl">
              {status === "checking" ? "Checking your workspace?..." : "Preparing your session..."}
            </h2>
            <p className="text-muted-foreground text-sm">Please wait while we sync your account state.</p>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto w-fit rounded-full bg-destructive/10 p-3 text-destructive">
            <span className="font-bold text-xl">!</span>
          </div>
          <div className="space-y-2">
            <h2 className="font-medium text-destructive text-xl">Sync Failed</h2>
            <p className="mx-auto max-w-xs text-muted-foreground text-sm">
              {errorMsg || "We couldn't verify your workspace access."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-medium text-sm underline underline-offset-4 transition-colors hover:text-primary"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
