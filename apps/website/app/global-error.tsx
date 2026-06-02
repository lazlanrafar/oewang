"use client";

import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "500 – Server Error | oewang",
  description: "Something went wrong on our end.",
};

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto px-4">
          <h1 className="font-serif text-6xl text-foreground">500</h1>
          <h2 className="font-serif text-2xl text-foreground">Server error</h2>
          <p className="text-muted-foreground">Something went wrong on our end. We&apos;re working to fix it.</p>
          {error.digest && <p className="text-xs text-muted-foreground font-mono">Error ID: {error.digest}</p>}
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-2 border border-foreground text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            Go home
          </Link>
        </div>
      </body>
    </html>
  );
}
