import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { WEBSITE_CONFIG } from "@workspace/constants";
import { Toaster } from "@workspace/ui";
import "@workspace/ui/globals.css";

export const metadata: Metadata = {
  title: WEBSITE_CONFIG.name,
  description: WEBSITE_CONFIG.meta.description,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
