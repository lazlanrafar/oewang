import type { ReactNode } from "react";

import { WEBSITE_CONFIG } from "@workspace/constants";
import type { Metadata } from "next";

import "@workspace/ui/globals.css";

export const metadata: Metadata = {
  title: WEBSITE_CONFIG.name,
  description: WEBSITE_CONFIG.meta.description,
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
