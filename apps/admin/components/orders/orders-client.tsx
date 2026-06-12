"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getAdminOrderStats,
  getAdminOrders,
} from "@workspace/modules/orders/orders.action";
import type { AdminOrderListing, AdminOrderStats } from "@workspace/types";
import {
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  TableSkeleton,
} from "@workspace/ui";

import { useOrdersStore } from "@/stores/orders";

import { OrdersClientCards } from "./orders-client-cards";
import {
  OrdersClientHeader,
  type OrdersFilters,
} from "./orders-client-header";
import { columns as orderColumns } from "./orders-columns";

type Props = {
  initialData: AdminOrderListing[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: AdminOrderStats;
  initialStart: string | null;
  initialEnd: string | null;
};

const STATUS_OPTIONS = [
  { id: "paid", name: "Paid" },
  { id: "pending", name: "Pending" },
  { id: "failed", name: "Failed" },
  { id: "canceled", name: "Canceled" },
];

export function OrdersClient({
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
  const setColumnsStore = useOrdersStore((s) => s.setColumns);
  const openDetail = useOrdersStore((s) => s.openDetail);

  const [filters, setFilters] = useState<OrdersFilters>({
    q: "",
    status: null,
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
    queryKey: ["admin-orders", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getAdminOrders({
        page: pageParam,
        limit: pageSize,
        search: filters.q || undefined,
        status: filters.status || undefined,
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
                orders: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getAdminOrders>>,
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
    queryKey: ["admin-orders-stats", statsKey],
    queryFn: async () =>
      getAdminOrderStats({
        start: statsKey.start ?? undefined,
        end: statsKey.end ?? undefined,
      }),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: isStatsInitial
      ? ({ success: true, data: initialStats } as Awaited<
          ReturnType<typeof getAdminOrderStats>
        >)
      : undefined,
  });

  const stats: AdminOrderStats =
    statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<AdminOrderListing[]>(
    () =>
      data?.pages?.flatMap((p) => (p.success ? p.data.orders : [])) ?? [],
    [data],
  );

  const columnsWithMeta = useMemo(
    () => orderColumns as ColumnDef<AdminOrderListing>[],
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
      <OrdersClientCards stats={stats} isLoading={isStatsLoading} />

      <OrdersClientHeader
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
            stickyColumnIds={["code"]}
          />
        ) : (
          <DataTable<AdminOrderListing>
            data={rows}
            columns={columnsWithMeta}
            setColumns={setColumns}
            tableId="orders"
            externalScrollContainerRef={containerRef}
            sticky={{ columns: ["code"], startFromColumn: 0 }}
            meta={{ onRowClick: openDetail }}
            emptyMessage={
              <DataTableEmptyState
                title="No orders found"
                description="There are no orders matching the current filters."
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
