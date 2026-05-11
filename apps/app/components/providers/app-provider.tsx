"use client";

import type * as React from "react";
import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getSubCurrencies, getTransactionSettings } from "@workspace/modules/setting/setting.action";
import { getMe } from "@workspace/modules/user/user.action";
import { getActiveWorkspace } from "@workspace/modules/workspace/workspace.action";
import { getActiveWorkspaceRole, normalizeWorkspaceRole } from "@/lib/workspace-permissions";

import { useRealtime } from "../../hooks/use-realtime";
import { type AppState, useAppStore } from "../../stores/app";

export function AppProvider({ children, dictionary }: { children: React.ReactNode; dictionary: Dictionary }) {
  const setUser = useAppStore((state: AppState) => state.setUser);
  const setWorkspace = useAppStore((state: AppState) => state.setWorkspace);
  const setSettings = useAppStore((state: AppState) => state.setSettings);
  const setSubCurrencies = useAppStore((state: AppState) => state.setSubCurrencies);
  const setIsLoading = useAppStore((state: AppState) => state.setIsLoading);
  const fetchAiQuota = useAppStore((state: AppState) => state.fetchAiQuota);
  const setDictionary = useAppStore((state: AppState) => state.setDictionary);

  // Realtime Sync
  useRealtime();

  useEffect(() => {
    fetchAiQuota();
  }, [fetchAiQuota]);

  // Set dictionary immediately and when it changes
  useEffect(() => {
    if (dictionary) setDictionary(dictionary);
  }, [dictionary, setDictionary]);

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
    if (workspaceData) {
      const currentUserRole = getActiveWorkspaceRole({
        workspaceId: userData?.user.workspace_id,
        workspaces: userData?.workspaces,
      });

      setWorkspace({
        ...workspaceData,
        current_user_role: normalizeWorkspaceRole(currentUserRole),
      });
    }
    if (settingsData) setSettings(settingsData);
    if (subCurrenciesData) setSubCurrencies(subCurrenciesData);

    setIsLoading(isUserLoading || isWorkspaceLoading || isSettingsLoading || isSubCurrenciesLoading);
  }, [
    userData,
    workspaceData,
    settingsData,
    subCurrenciesData,
    isUserLoading,
    isWorkspaceLoading,
    isSettingsLoading,
    isSubCurrenciesLoading,
    setUser,
    setWorkspace,
    setSettings,
    setSubCurrencies,
    setIsLoading,
  ]);

  return <>{children}</>;
}
