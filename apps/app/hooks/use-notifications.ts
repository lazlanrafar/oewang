"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  const notificationsQuery = useInfiniteQuery({
    queryKey: ["notifications", workspace?.id],
    queryFn: ({ pageParam }) => getNotifications({ page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const meta = lastPage?.meta?.pagination;
      return meta && meta.page < meta.total_pages ? meta.page + 1 : undefined;
    },
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
  // The rows are directly on `.data`, not nested under `.data.rows`. Each page is
  // this same shape; flatten every fetched page into one list.
  const notifications: Notification[] = (notificationsQuery.data?.pages ?? []).flatMap((page) => {
    const raw = page?.data as Notification[] | { rows?: Notification[] } | undefined;
    return Array.isArray(raw) ? raw : (raw?.rows ?? []);
  });
  const unreadCount = notifications.filter((n: Notification) => !n.is_read).length || 0;

  return {
    notifications,
    pagination: notificationsQuery.data?.pages.at(-1)?.meta?.pagination,
    unreadCount,
    isLoading: notificationsQuery.isLoading,
    isError: notificationsQuery.isError,
    hasNextPage: notificationsQuery.hasNextPage,
    isFetchingNextPage: notificationsQuery.isFetchingNextPage,
    fetchNextPage: notificationsQuery.fetchNextPage,
    settings: settingsQuery.data?.data,
    markAsRead: markReadMutation.mutate,
    deleteNotification: deleteMutation.mutate,
    updateSettings: updateSettingsMutation.mutate,
    refetch: notificationsQuery.refetch,
  };
}
