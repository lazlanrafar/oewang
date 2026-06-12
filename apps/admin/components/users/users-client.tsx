"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getSystemAdminUserStats,
  getSystemAdminUsers,
} from "@workspace/modules/system-admin/system-admin.action";
import type {
  SystemAdminUser,
  SystemAdminUserStats,
} from "@workspace/types";
import {
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  TableSkeleton,
} from "@workspace/ui";

import { useUsersStore } from "@/stores/users";

import { UsersClientCards } from "./users-client-cards";
import {
  UsersClientHeader,
  type UsersFilters,
} from "./users-client-header";
import { userColumns } from "./user-columns";

type Props = {
  initialData: SystemAdminUser[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: SystemAdminUserStats;
  initialStart: string | null;
  initialEnd: string | null;
};

const STATUS_OPTIONS = [
  { id: "owner", name: "Owner" },
  { id: "finance", name: "Finance" },
  { id: "user", name: "User" },
];

export function UsersClient({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  initialStats,
  initialStart,
  initialEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumnsLocal] =
    useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);
  const setColumnsStore = useUsersStore((s) => s.setColumns);

  const [filters, setFilters] = useState<UsersFilters>({
    q: "",
    system_role: null,
    start: initialStart,
    end: initialEnd,
  });
  const [mountFilters] = useState(filters);

  const isInitial = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(mountFilters),
    [filters, mountFilters],
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["admin-users", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getSystemAdminUsers({
        page: pageParam,
        limit: pageSize,
        search: filters.q || undefined,
        system_role: filters.system_role || undefined,
        start: filters.start || undefined,
        end: filters.end || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.success) return undefined;
      const meta = lastPage.data.meta;
      return meta.page < meta.total_pages ? meta.page + 1 : undefined;
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: isInitial
      ? {
          pages: [
            {
              success: true,
              data: {
                users: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getSystemAdminUsers>>,
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const statsKey = useMemo(
    () => ({ start: filters.start, end: filters.end }),
    [filters.start, filters.end],
  );
  const isStatsInitial =
    statsKey.start === initialStart && statsKey.end === initialEnd;

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["admin-users-stats", statsKey],
    queryFn: async () =>
      getSystemAdminUserStats({
        start: statsKey.start ?? undefined,
        end: statsKey.end ?? undefined,
      }),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: isStatsInitial
      ? ({ success: true, data: initialStats } as Awaited<
          ReturnType<typeof getSystemAdminUserStats>
        >)
      : undefined,
  });

  const stats: SystemAdminUserStats =
    statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<SystemAdminUser[]>(
    () =>
      data?.pages?.flatMap((p) => (p.success ? p.data.users : [])) ?? [],
    [data],
  );

  const columnsWithMeta = useMemo(
    () => userColumns as ColumnDef<SystemAdminUser>[],
    [],
  );

  const setColumns = (
    next: ComponentProps<typeof DataTableColumnsVisibility>["columns"],
  ) => {
    setColumnsLocal(next);
    setColumnsStore(next as never);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <UsersClientCards stats={stats} isLoading={isStatsLoading} />

      <UsersClientHeader
        filters={filters}
        onFilterChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        columns={columns}
      />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={columnsWithMeta}
            rowCount={pageSize}
            stickyColumnIds={["name"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<SystemAdminUser>
            data={rows}
            columns={columnsWithMeta}
            setColumns={setColumns}
            tableId="users"
            externalScrollContainerRef={containerRef}
            sticky={{ columns: ["name"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title="No users found"
                description="There are no users matching the current filters."
              />
            }
            infiniteScroll
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            hFull
          />
        )}
      </div>
    </div>
  );
}
