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
      <body className="flex min-h-screen items-center justify-center bg-background">
        <div className="mx-auto max-w-md space-y-4 px-4 text-center">
          <h1 className="font-serif text-6xl text-foreground">500</h1>
          <h2 className="font-serif text-2xl text-foreground">Server error</h2>
          <p className="text-muted-foreground">Something went wrong on our end. We&apos;re working to fix it.</p>
          {error.digest && <p className="font-mono text-muted-foreground text-xs">Error ID: {error.digest}</p>}
          <Link
            href="/"
            className="inline-flex items-center justify-center border border-foreground px-6 py-2 text-foreground transition-colors hover:bg-foreground hover:text-background"
          >
            Go home
          </Link>
        </div>
      </body>
    </html>
  );
}
