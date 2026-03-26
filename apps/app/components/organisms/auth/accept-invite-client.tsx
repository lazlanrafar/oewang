"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@workspace/supabase";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { acceptInvitationAction } from "@workspace/modules/workspace/workspace.action";

interface AcceptInviteClientProps {
  token: string | null;
}

export function AcceptInviteClient({ token }: AcceptInviteClientProps) {
  const router = useRouter();
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(
    null,
  );

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
    } catch (error: any) {
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
      <div className="flex items-center justify-center w-full min-h-full p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive flex items-center justify-center gap-2">
              <XCircle className="h-5 w-5" />
              Invalid Link
            </CardTitle>
            <CardDescription>
              This invitation link is missing a token. Please check your email
              and try again.
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
    <div className="flex items-center justify-center w-full min-h-full p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Workspace Invitation</CardTitle>
          <CardDescription>
            You have been invited to join a workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center py-6 gap-4 text-center">
          {isAuthenticated === null ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : isAuthenticated === false ? (
            <>
              <p className="text-muted-foreground">
                Please log in or sign up to accept this invitation.
              </p>
              <div className="flex flex-col w-full gap-2">
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
                <p className="text-sm text-muted-foreground">
                  Redirecting you to your dashboard...
                </p>
              </div>
            </>
          ) : status === "error" ? (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium text-lg text-destructive">
                  Failed to Accept
                </p>
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <Button
                onClick={() => setStatus("idle")}
                variant="outline"
                className="mt-4"
              >
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
