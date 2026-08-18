import { getFaqStats, getFaqs } from "@workspace/modules/faq/faq.action";
import type { Faq, FaqStats } from "@workspace/types";
import type { Metadata } from "next";

import { FaqSheet } from "@/components/faqs/faq-sheet";
import { FaqsClient } from "@/components/faqs/faqs-client";

export const metadata: Metadata = { title: "FAQs" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: FaqStats = { total: 0, published: 0, draft: 0 };

export default async function FaqsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;

  let initialData: Faq[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: FaqStats = EMPTY_STATS;

  try {
    const [faqsRes, statsRes] = await Promise.all([
      getFaqs({ page: String(page), limit: String(limit), search }),
      getFaqStats(),
    ]);

    if (faqsRes?.success) {
      initialData = faqsRes.data.faqList;
      rowCount = faqsRes.data.meta.total ?? 0;
      pageCount = faqsRes.data.meta.total_pages || 1;
      initialPage = (faqsRes.data.meta.page || 1) - 1;
    }

    if (statsRes?.success) initialStats = statsRes.data;
  } catch (error) {
    console.error("Failed to fetch FAQs page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <FaqsClient
          initialData={initialData}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={initialPage}
          pageSize={limit}
          initialStats={initialStats}
        />
      </div>

      <FaqSheet />
    </div>
  );
}
