"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: ReactNode }) {
  // The marketing site is always dark ("dark fintech"). forcedTheme pins it so
  // the app-shared next-themes toggle can't flip it; html already ships .dark.
  return (
    <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
