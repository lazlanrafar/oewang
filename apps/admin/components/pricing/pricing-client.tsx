"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getPricing,
  getPricingStats,
} from "@workspace/modules/pricing/pricing.action";
import type { Pricing, PricingStats } from "@workspace/types";
import {
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  TableSkeleton,
} from "@workspace/ui";

import { usePricingStore } from "@/stores/pricing";

import { PricingClientCards } from "./pricing-client-cards";
import {
  PricingClientHeader,
  type PricingFilters,
} from "./pricing-client-header";
import { pricingColumns } from "./pricing-columns";

type Props = {
  initialData: Pricing[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: PricingStats;
};

const STATUS_OPTIONS = [
  { id: "active", name: "Active" },
  { id: "inactive", name: "Inactive" },
];

export function PricingClient({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  initialStats,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumnsLocal] =
    useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);
  const setColumnsStore = usePricingStore((s) => s.setColumns);
  const openDetail = usePricingStore((s) => s.openDetail);
  const openCreate = usePricingStore((s) => s.openCreate);

  const [filters, setFilters] = useState<PricingFilters>({
    q: "",
    status: null,
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
    queryKey: ["admin-pricing", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getPricing({
        page: String(pageParam),
        limit: String(pageSize),
        search: filters.q || undefined,
        is_active:
          filters.status === "active"
            ? "true"
            : filters.status === "inactive"
              ? "false"
              : undefined,
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
                pricingList: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getPricing>>,
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["admin-pricing-stats"],
    queryFn: async () => getPricingStats(),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: { success: true, data: initialStats } as Awaited<
      ReturnType<typeof getPricingStats>
    >,
  });

  const stats: PricingStats =
    statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<Pricing[]>(
    () =>
      data?.pages?.flatMap((p) => (p.success ? p.data.pricingList : [])) ?? [],
    [data],
  );

  const columnsWithMeta = useMemo(
    () => pricingColumns as ColumnDef<Pricing>[],
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
      <PricingClientCards stats={stats} isLoading={isStatsLoading} />

      <PricingClientHeader
        filters={filters}
        onFilterChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        columns={columns}
        onCreate={openCreate}
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
          <DataTable<Pricing>
            data={rows}
            columns={columnsWithMeta}
            setColumns={setColumns}
            tableId="pricing"
            externalScrollContainerRef={containerRef}
            meta={{ onRowClick: openDetail }}
            sticky={{ columns: ["name"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title="No pricing plans found"
                description="There are no plans matching the current filters."
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
