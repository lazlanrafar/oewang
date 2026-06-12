"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getSystemAdminWorkspaceStats,
  getSystemAdminWorkspaces,
} from "@workspace/modules/system-admin/system-admin.action";
import type {
  SystemAdminPlan,
  SystemAdminWorkspace,
  SystemAdminWorkspaceStats,
} from "@workspace/types";
import {
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  TableSkeleton,
} from "@workspace/ui";

import { useWorkspacesStore } from "@/stores/workspaces";

import { WorkspacesClientCards } from "./workspaces-client-cards";
import {
  WorkspacesClientHeader,
  type WorkspacesFilters,
} from "./workspaces-client-header";
import { getWorkspaceColumns } from "./workspace-columns";

type Props = {
  initialData: SystemAdminWorkspace[];
  plans: SystemAdminPlan[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: SystemAdminWorkspaceStats;
};

export function WorkspacesClient({
  initialData,
  plans,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  initialStats,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumnsLocal] =
    useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);
  const setColumnsStore = useWorkspacesStore((s) => s.setColumns);

  const [filters, setFilters] = useState<WorkspacesFilters>({ q: "" });
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
    queryKey: ["admin-workspaces", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getSystemAdminWorkspaces({
        page: pageParam,
        limit: pageSize,
        search: filters.q || undefined,
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
                workspaces: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getSystemAdminWorkspaces>>,
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["admin-workspaces-stats"],
    queryFn: async () => getSystemAdminWorkspaceStats(),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: { success: true, data: initialStats } as Awaited<
      ReturnType<typeof getSystemAdminWorkspaceStats>
    >,
  });

  const stats: SystemAdminWorkspaceStats =
    statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<SystemAdminWorkspace[]>(
    () =>
      data?.pages?.flatMap((p) => (p.success ? p.data.workspaces : [])) ?? [],
    [data],
  );

  const workspaceColumns = useMemo(
    () => getWorkspaceColumns(plans) as ColumnDef<SystemAdminWorkspace>[],
    [plans],
  );

  const setColumns = (
    next: ComponentProps<typeof DataTableColumnsVisibility>["columns"],
  ) => {
    setColumnsLocal(next);
    setColumnsStore(next as never);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <WorkspacesClientCards stats={stats} isLoading={isStatsLoading} />

      <WorkspacesClientHeader
        filters={filters}
        onFilterChange={setFilters}
        columns={columns}
      />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={workspaceColumns}
            rowCount={pageSize}
            stickyColumnIds={["name"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<SystemAdminWorkspace>
            data={rows}
            columns={workspaceColumns}
            setColumns={setColumns}
            tableId="workspaces"
            externalScrollContainerRef={containerRef}
            sticky={{ columns: ["name"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title="No workspaces found"
                description="There are no workspaces matching the current filters."
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
