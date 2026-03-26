import type { Metadata } from "next";
import { ComingSoonClient } from "@/components/organisms/shared/coming-soon-client";

export const metadata: Metadata = {
  title: "Coming Soon",
  description: "This feature is currently under development. Stay tuned for updates!",
};

export default function ComingSoonPage() {
  return <ComingSoonClient />;
}
