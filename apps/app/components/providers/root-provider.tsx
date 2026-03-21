"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppProvider } from "./app-provider";
import type { Dictionary } from "@workspace/dictionaries";

export function Providers({ 
  children,
  dictionary
}: { 
  children: ReactNode,
  dictionary: Dictionary
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider dictionary={dictionary}>{children}</AppProvider>
    </QueryClientProvider>
  );
}
