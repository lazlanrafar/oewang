import { getFeedback, getFeedbackStats } from "@workspace/modules/feedback/feedback.action";
import type { Feedback, FeedbackStats } from "@workspace/types";
import type { Metadata } from "next";

import { FeedbackClient } from "@/components/feedback/feedback-client";

export const metadata: Metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: FeedbackStats = {
  total: 0,
  new: 0,
  in_review: 0,
  planned: 0,
  resolved: 0,
  rejected: 0,
};

export default async function FeedbackPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;

  let initialData: Feedback[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: FeedbackStats = EMPTY_STATS;

  try {
    const [feedbackRes, statsRes] = await Promise.all([
      getFeedback({ page, limit, search }),
      getFeedbackStats(),
    ]);

    if (feedbackRes?.success) {
      initialData = feedbackRes.data.feedback;
      rowCount = feedbackRes.data.meta.total;
      pageCount = feedbackRes.data.meta.total_pages || 1;
      initialPage = (feedbackRes.data.meta.page || 1) - 1;
    }

    if (statsRes?.success) {
      initialStats = statsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch feedback page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <FeedbackClient
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
