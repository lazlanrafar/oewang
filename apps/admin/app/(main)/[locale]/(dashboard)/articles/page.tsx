import { getArticleStats, getArticles } from "@workspace/modules/article/article.action";
import type { Article, ArticleStats } from "@workspace/types";
import type { Metadata } from "next";

import { ArticlesClient } from "@/components/articles/articles-client";

export const metadata: Metadata = { title: "Articles" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: ArticleStats = { total: 0, published: 0, draft: 0 };

export default async function ArticlesPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;

  let initialData: Article[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: ArticleStats = EMPTY_STATS;

  try {
    const [articlesRes, statsRes] = await Promise.all([
      getArticles({ page: String(page), limit: String(limit), search }),
      getArticleStats(),
    ]);

    if (articlesRes?.success) {
      initialData = articlesRes.data.articleList;
      rowCount = articlesRes.data.meta.total ?? 0;
      pageCount = articlesRes.data.meta.total_pages || 1;
      initialPage = (articlesRes.data.meta.page || 1) - 1;
    }

    if (statsRes?.success) initialStats = statsRes.data;
  } catch (error) {
    console.error("Failed to fetch articles page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <ArticlesClient
          initialData={initialData}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={initialPage}
          pageSize={limit}
          initialStats={initialStats}
        />
      </div>
    </div>
  );
}
