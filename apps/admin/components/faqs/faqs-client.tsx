"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { getFaqStats, getFaqs } from "@workspace/modules/faq/faq.action";
import type { Faq, FaqStats } from "@workspace/types";
import { DataTable, type DataTableColumnsVisibility, DataTableEmptyState, TableSkeleton } from "@workspace/ui";

import { useFaqStore } from "@/stores/faqs";

import { faqColumns } from "./faq-columns";
import { FaqsClientCards } from "./faqs-client-cards";
import { type FaqFilters, FaqsClientHeader } from "./faqs-client-header";

type Props = {
  initialData: Faq[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: FaqStats;
};

const STATUS_OPTIONS = [
  { id: "published", name: "Published" },
  { id: "draft", name: "Draft" },
];

export function FaqsClient({ initialData, rowCount, pageCount, initialPage, pageSize, initialStats }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumnsLocal] = useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);
  const setColumnsStore = useFaqStore((s) => s.setColumns);
  const openEdit = useFaqStore((s) => s.openEdit);
  const openCreate = useFaqStore((s) => s.openCreate);

  const [filters, setFilters] = useState<FaqFilters>({ q: "", status: null });
  const [mountFilters] = useState(filters);

  const isInitial = useMemo(() => JSON.stringify(filters) === JSON.stringify(mountFilters), [filters, mountFilters]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["admin-faqs", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getFaqs({
        page: String(pageParam),
        limit: String(pageSize),
        search: filters.q || undefined,
        published: filters.status === "published" ? "true" : filters.status === "draft" ? "false" : undefined,
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
                faqList: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getFaqs>>,
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["admin-faqs-stats"],
    queryFn: async () => getFaqStats(),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: { success: true, data: initialStats } as Awaited<ReturnType<typeof getFaqStats>>,
  });

  const stats: FaqStats = statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<Faq[]>(() => data?.pages?.flatMap((p) => (p.success ? p.data.faqList : [])) ?? [], [data]);

  const columnsWithMeta = useMemo(() => faqColumns as ColumnDef<Faq>[], []);

  const setColumns = (next: ComponentProps<typeof DataTableColumnsVisibility>["columns"]) => {
    setColumnsLocal(next);
    setColumnsStore(next as never);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <FaqsClientCards stats={stats} isLoading={isStatsLoading} />

      <FaqsClientHeader
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
            stickyColumnIds={["question"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<Faq>
            data={rows}
            columns={columnsWithMeta}
            setColumns={setColumns}
            tableId="faqs"
            externalScrollContainerRef={containerRef}
            meta={{ onRowClick: openEdit }}
            sticky={{ columns: ["question"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title="No FAQs found"
                description="Create your first FAQ to show it on the marketing site."
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
