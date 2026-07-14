"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { getArticleStats, getArticles } from "@workspace/modules/article/article.action";
import type { Article, ArticleStats } from "@workspace/types";
import { DataTable, type DataTableColumnsVisibility, DataTableEmptyState, TableSkeleton } from "@workspace/ui";

import { useArticleStore } from "@/stores/articles";

import { articleColumns } from "./article-columns";
import { ArticlesClientCards } from "./articles-client-cards";
import { type ArticleFilters, ArticlesClientHeader } from "./articles-client-header";

type Props = {
  initialData: Article[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  initialStats: ArticleStats;
};

const STATUS_OPTIONS = [
  { id: "published", name: "Published" },
  { id: "draft", name: "Draft" },
];

export function ArticlesClient({ initialData, rowCount, pageCount, initialPage, pageSize, initialStats }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumnsLocal] = useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);
  const setColumnsStore = useArticleStore((s) => s.setColumns);
  const openEdit = useArticleStore((s) => s.openEdit);
  const openCreate = useArticleStore((s) => s.openCreate);

  const [filters, setFilters] = useState<ArticleFilters>({
    q: "",
    status: null,
  });
  const [mountFilters] = useState(filters);

  const isInitial = useMemo(() => JSON.stringify(filters) === JSON.stringify(mountFilters), [filters, mountFilters]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["admin-articles", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getArticles({
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
                articleList: initialData,
                meta: {
                  total: rowCount,
                  page: initialPage + 1,
                  limit: pageSize,
                  total_pages: pageCount,
                },
              },
            } as Awaited<ReturnType<typeof getArticles>>,
          ],
          pageParams: [1],
        }
      : undefined,
  });

  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["admin-articles-stats"],
    queryFn: async () => getArticleStats(),
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: { success: true, data: initialStats } as Awaited<ReturnType<typeof getArticleStats>>,
  });

  const stats: ArticleStats = statsData && statsData.success ? statsData.data : initialStats;

  const rows = useMemo<Article[]>(
    () => data?.pages?.flatMap((p) => (p.success ? p.data.articleList : [])) ?? [],
    [data],
  );

  const columnsWithMeta = useMemo(() => articleColumns as ColumnDef<Article>[], []);

  const setColumns = (next: ComponentProps<typeof DataTableColumnsVisibility>["columns"]) => {
    setColumnsLocal(next);
    setColumnsStore(next as never);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <ArticlesClientCards stats={stats} isLoading={isStatsLoading} />

      <ArticlesClientHeader
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
            stickyColumnIds={["title"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<Article>
            data={rows}
            columns={columnsWithMeta}
            setColumns={setColumns}
            tableId="articles"
            externalScrollContainerRef={containerRef}
            meta={{ onRowClick: openEdit }}
            sticky={{ columns: ["title"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title="No articles found"
                description="Write your first article to publish it on the blog."
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
