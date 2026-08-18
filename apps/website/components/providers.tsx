"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: ReactNode }) {
  // Light by default (clean white); users can toggle to the dark "fintech" look.
  // next-themes owns the `.dark` class on <html>; two-state (no system option).
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
