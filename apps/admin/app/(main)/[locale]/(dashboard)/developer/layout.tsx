import { DeveloperLayoutClient } from "@/components/developer/developer-layout-client";

export default function DeveloperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DeveloperLayoutClient>{children}</DeveloperLayoutClient>;
}
