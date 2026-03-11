"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTransactionSettings } from "@workspace/modules/setting/setting.action";
import { useSettingsStore } from "@/stores/settings-store";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const setSettings = useSettingsStore((state) => state.setSettings);
  const setIsLoading = useSettingsStore((state) => state.setIsLoading);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings", "transaction"],
    queryFn: async () => {
      const result = await getTransactionSettings();
      if (result.success) return result.data;
      return null;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (settings) {
      setSettings(settings);
    }
    setIsLoading(isLoading);
  }, [settings, isLoading, setSettings, setIsLoading]);

  return <>{children}</>;
}
