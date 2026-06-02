"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { type DehydratedState, HydrationBoundary, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";

import { AppProvider } from "./app-provider";
import { ConfirmModalProvider } from "./confirm-modal-provider";

interface ProvidersProps {
  children: ReactNode;
  dictionary: Dictionary;
  dehydratedState?: DehydratedState;
}

export function Providers({ children, dictionary, dehydratedState }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes default
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Merge server-prefetched workspace settings into the cache so
          AppProvider reads them synchronously on first render. */}
      <HydrationBoundary state={dehydratedState}>
        <AppProvider dictionary={dictionary}>
          <ConfirmModalProvider>{children}</ConfirmModalProvider>
        </AppProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}
