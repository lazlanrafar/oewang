import { AppsClient } from "@/components/organisms/apps/apps-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Apps",
};

export default function AppsPage() {
  return (
    <div>
      <AppsClient />
    </div>
  );
}
