"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTransactionSettings } from "@workspace/modules/setting/setting.action";
import { getActiveWorkspace } from "@workspace/modules/workspace/workspace.action";
import { getMe } from "@workspace/modules/user/user.action";
import { useAppStore, type AppState } from "../../stores/app";
import type { Dictionary } from "@workspace/dictionaries";

export function AppProvider({
  children,
  dictionary,
}: {
  children: React.ReactNode;
  dictionary: Dictionary;
}) {
  const setUser = useAppStore((state: AppState) => state.setUser);
  const setWorkspace = useAppStore((state: AppState) => state.setWorkspace);
  const setSettings = useAppStore((state: AppState) => state.setSettings);
  const setDictionary = useAppStore((state: AppState) => state.setDictionary);
  const setIsLoading = useAppStore((state: AppState) => state.setIsLoading);

  const { data: userData, isLoading: isUserLoading } = useQuery({
    queryKey: ["user", "me"],
    queryFn: async () => {
      const result = await getMe();
      if (result.success) return result.data;
      return null;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const { data: workspaceData, isLoading: isWorkspaceLoading } = useQuery({
    queryKey: ["workspace", "active"],
    queryFn: async () => {
      const result = await getActiveWorkspace();
      if (result.success) return result.data;
      return null;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const { data: settingsData, isLoading: isSettingsLoading } = useQuery({
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
    if (userData) setUser(userData.user);
    if (workspaceData) setWorkspace(workspaceData);
    if (settingsData) setSettings(settingsData);
    if (dictionary) setDictionary(dictionary);

    setIsLoading(isUserLoading || isWorkspaceLoading || isSettingsLoading);
  }, [
    userData,
    workspaceData,
    settingsData,
    dictionary,
    isUserLoading,
    isWorkspaceLoading,
    isSettingsLoading,
    setUser,
    setWorkspace,
    setSettings,
    setDictionary,
    setIsLoading,
  ]);

  return <>{children}</>;
}
