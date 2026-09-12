"use client";

import { useEffect } from "react";

// Catches crashes in the root layout itself — app/error.tsx only catches
// errors below (main)/[locale]/layout.tsx, not in it.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    } else {
      console.error(error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-2xl space-y-4 px-4 text-center">
          <h1 className="font-serif text-4xl text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground">We encountered an unexpected error. Please try again.</p>
          {error.digest && <p className="font-mono text-muted-foreground text-xs">Error ID: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
