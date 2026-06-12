"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@workspace/types";

import {
  deleteNotification,
  getNotificationSettings,
  getNotifications,
  markNotificationsRead,
  updateNotificationSettings,
} from "@/actions/notification.actions";

import { useAppStore } from "../stores/app";

export function useNotifications() {
  const queryClient = useQueryClient();
  const user = useAppStore((state) => state.user);
  const workspace = useAppStore((state) => state.workspace);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", workspace?.id],
    queryFn: () => getNotifications({ page: 1, limit: 20 }),
    // Realtime invalidation is handled by useRealtime + INVALIDATIONS["notifications"].
    // Keep a long fallback poll for environments where WebSockets are blocked.
    refetchInterval: 5 * 60 * 1000,
    enabled: !!user?.id && !!workspace?.id,
  });

  const settingsQuery = useQuery({
    queryKey: ["notification-settings", workspace?.id],
    queryFn: () => getNotificationSettings(),
    enabled: !!user?.id && !!workspace?.id,
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: string[]) => markNotificationsRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: updateNotificationSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-settings"] });
    },
  });

  // API returns { data: Notification[], meta: { pagination } } via buildPaginatedSuccess.
  // The rows are directly on `.data`, not nested under `.data.rows`.
  const raw = notificationsQuery.data?.data as
    | Notification[]
    | { rows?: Notification[] }
    | undefined;
  const notifications: Notification[] = Array.isArray(raw) ? raw : (raw?.rows ?? []);
  const unreadCount = notifications.filter((n: Notification) => !n.is_read).length || 0;

  return {
    notifications,
    pagination: notificationsQuery.data?.meta?.pagination,
    unreadCount,
    isLoading: notificationsQuery.isLoading,
    isError: notificationsQuery.isError,
    settings: settingsQuery.data?.data,
    markAsRead: markReadMutation.mutate,
    deleteNotification: deleteMutation.mutate,
    updateSettings: updateSettingsMutation.mutate,
    refetch: notificationsQuery.refetch,
  };
}
