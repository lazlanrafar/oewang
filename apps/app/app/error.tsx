"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Report to Sentry in production (console is stripped from prod builds).
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    } else {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto max-w-2xl space-y-4 px-4 text-center">
        <h1 className="font-serif text-4xl text-foreground">Something went wrong</h1>
        <p className="text-muted-foreground">We encountered an unexpected error. Please try again.</p>
        {error.digest && <p className="font-mono text-muted-foreground text-xs">Error ID: {error.digest}</p>}
        {/* Never expose internal error messages/stack traces to end users in
            production — only render them while developing locally. */}
        {process.env.NODE_ENV !== "production" && (
          <div className="max-h-64 overflow-auto bg-muted p-4 text-left font-mono text-xs">
            <p className="mb-2 font-bold text-red-500">{error.message}</p>
            <pre className="whitespace-pre-wrap">{error.stack}</pre>
          </div>
        )}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center border border-foreground px-6 py-2 text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
