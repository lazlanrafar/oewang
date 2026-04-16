"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTransactionSettings, getSubCurrencies } from "@workspace/modules/setting/setting.action";
import { getActiveWorkspace } from "@workspace/modules/workspace/workspace.action";
import { getMe } from "@workspace/modules/user/user.action";
import { useAppStore, type AppState } from "../../stores/app";
import type { Dictionary } from "@workspace/dictionaries";
import { useRealtime } from "../../hooks/use-realtime";

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
  const setSubCurrencies = useAppStore((state: AppState) => state.setSubCurrencies);
  const setDictionary = useAppStore((state: AppState) => state.setDictionary);
  const setIsLoading = useAppStore((state: AppState) => state.setIsLoading);
  const fetchAiQuota = useAppStore((state: AppState) => state.fetchAiQuota);
  
  // Initialize Realtime Sync
  useRealtime();

  useEffect(() => {
    fetchAiQuota();
  }, [fetchAiQuota]);

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
  
  const { data: subCurrenciesData, isLoading: isSubCurrenciesLoading } = useQuery({
    queryKey: ["settings", "sub-currencies"],
    queryFn: async () => {
      const result = await getSubCurrencies();
      if (result.success) return result.data;
      return [];
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (userData) setUser(userData.user);
    if (workspaceData) setWorkspace(workspaceData);
    if (settingsData) setSettings(settingsData);
    if (subCurrenciesData) setSubCurrencies(subCurrenciesData);
    if (dictionary) setDictionary(dictionary);

    setIsLoading(isUserLoading || isWorkspaceLoading || isSettingsLoading || isSubCurrenciesLoading);
  }, [
    userData,
    workspaceData,
    settingsData,
    subCurrenciesData,
    dictionary,
    isUserLoading,
    isWorkspaceLoading,
    isSettingsLoading,
    isSubCurrenciesLoading,
    setUser,
    setWorkspace,
    setSettings,
    setSubCurrencies,
    setDictionary,
    setIsLoading,
  ]);

  return <>{children}</>;
}
