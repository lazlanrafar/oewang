"use client";

import * as React from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { acceptInvitationAction } from "@workspace/modules/workspace/workspace.action";
import { createBrowserClient } from "@workspace/supabase";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface AcceptInviteClientProps {
  token: string | null;
}

export function AcceptInviteClient({ token }: AcceptInviteClientProps) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);

  const supabase = createBrowserClient();

  React.useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();
  }, [supabase]);

  const handleAccept = React.useCallback(async () => {
    if (!token) return;

    setStatus("loading");
    try {
      const result = await acceptInvitationAction(token);
      if (result.success) {
        setStatus("success");
        toast.success("Invitation accepted!");
        setTimeout(() => {
          router.push("/overview");
        }, 2000);
      } else {
        setStatus("error");
        setErrorMessage(result.error || "Failed to accept invitation");
        toast.error(result.error || "Failed to accept invitation");
      }
    } catch (_error: unknown) {
      setStatus("error");
      setErrorMessage("An unexpected error occurred");
      toast.error("An unexpected error occurred");
    }
  }, [token, router]);

  // Automatically try to accept if token is present and user is authenticated
  React.useEffect(() => {
    if (token && isAuthenticated === true && status === "idle") {
      handleAccept();
    }
  }, [token, isAuthenticated, status, handleAccept]);

  if (!token) {
    return (
      <div className="flex min-h-full w-full items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Invalid Link
            </CardTitle>
            <CardDescription>
              This invitation link is missing a token. Please check your email and try again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/overview">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>You have been invited to join a workspace?.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center">
          {isAuthenticated === null ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : isAuthenticated === false ? (
            <>
              <p className="text-muted-foreground">Please log in or sign up to accept this invitation.</p>
              <div className="flex w-full flex-col gap-2">
                <Button asChild>
                  <Link
                    href={`/login?redirectTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
                  >
                    Log In
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link
                    href={`/register?redirectTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`}
                  >
                    Sign Up
                  </Link>
                </Button>
              </div>
            </>
          ) : status === "loading" ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p>Accepting invitation...</p>
            </>
          ) : status === "success" ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="space-y-1">
                <p className="font-medium text-lg">Invitation Accepted!</p>
                <p className="text-muted-foreground text-sm">Redirecting you to your dashboard...</p>
              </div>
            </>
          ) : status === "error" ? (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-destructive text-lg">Failed to Accept</p>
                <p className="text-muted-foreground text-sm">{errorMessage}</p>
              </div>
              <Button onClick={() => setStatus("idle")} variant="outline" className="mt-4">
                Try Again
              </Button>
            </>
          ) : (
            <Button onClick={handleAccept} className="w-full">
              Accept Invitation
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
