"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 max-w-md mx-auto px-4">
        <h1 className="font-serif text-4xl text-foreground">Something went wrong</h1>
        <p className="text-muted-foreground">We encountered an unexpected error. Please try again.</p>
        {error.digest && <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>}
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center px-6 py-2 border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
