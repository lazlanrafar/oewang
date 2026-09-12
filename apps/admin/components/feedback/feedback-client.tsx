"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { getFeedback, getFeedbackStats } from "@workspace/modules/feedback/feedback.action";
import type { Feedback, FeedbackStats } from "@workspace/types";
import {
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  TableSkeleton,
} from "@workspace/ui";

import { FeedbackClientCards } from "./feedback-client-cards";
import { FeedbackClientHeader, type FeedbackFilters } from "./feedback-client-header";
import { getFeedbackColumns } from "./feedback-columns";

type Props = {
  initialData: Feedback[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: FeedbackStats;
};

export function FeedbackClient({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  initialStats,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] =
    useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);

  const [filters, setFilters] = useState<FeedbackFilters>({ q: "" });
  const [mountFilters] = useState(filters);

  const isInitial = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(mountFilters),
    [filters, mountFilters],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["admin-feedback", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getFeedback({
        page: pageParam,
        limit: pageSize,
        search: filters.q || undefined,
        status: filters.status,
        type: filters.type,
        source: filters.source,
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
                feedback: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getFeedback>>,
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["admin-feedback-stats"],
    queryFn: async () => getFeedbackStats(),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: { success: true, data: initialStats } as Awaited<
      ReturnType<typeof getFeedbackStats>
    >,
  });

  const stats: FeedbackStats = statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<Feedback[]>(
    () => data?.pages?.flatMap((p) => (p.success ? p.data.feedback : [])) ?? [],
    [data],
  );

  const feedbackColumns = useMemo(() => getFeedbackColumns() as ColumnDef<Feedback>[], []);

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <FeedbackClientCards stats={stats} isLoading={isStatsLoading} />

      <FeedbackClientHeader filters={filters} onFilterChange={setFilters} columns={columns} />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={feedbackColumns}
            rowCount={pageSize}
            stickyColumnIds={["message"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<Feedback>
            data={rows}
            columns={feedbackColumns}
            setColumns={setColumns}
            tableId="feedback"
            externalScrollContainerRef={containerRef}
            sticky={{ columns: ["message"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title="No feedback found"
                description="There is no feedback matching the current filters."
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
