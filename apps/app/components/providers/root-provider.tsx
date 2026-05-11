"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";

import { AppProvider } from "./app-provider";
import { ConfirmModalProvider } from "./confirm-modal-provider";

export function Providers({ children, dictionary }: { children: ReactNode; dictionary: Dictionary }) {
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
      <AppProvider dictionary={dictionary}>
        <ConfirmModalProvider>{children}</ConfirmModalProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
