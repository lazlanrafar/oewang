"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs } from "@workspace/ui";

export function OverviewTabs({ defaultTab, children }: { defaultTab: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = searchParams.get("tab") || defaultTab;

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 dashboard-content-tabs">
      {children}
    </Tabs>
  );
}
