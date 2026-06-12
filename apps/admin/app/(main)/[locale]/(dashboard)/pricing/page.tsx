import {
  getPricing,
  getPricingStats,
} from "@workspace/modules/pricing/pricing.action";
import type { Pricing, PricingStats } from "@workspace/types";
import type { Metadata } from "next";

import { PricingClient } from "@/components/pricing/pricing-client";
import { PricingDetailSheet } from "@/components/pricing/pricing-detail-sheet";
import { PricingSheet } from "@/components/pricing/pricing-sheet";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: PricingStats = {
  total: 0,
  active: 0,
  inactive: 0,
  addons: 0,
};

export default async function PricingPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const sortBy =
    typeof searchParams.sortBy === "string" ? searchParams.sortBy : undefined;
  const sortOrder =
    searchParams.sortOrder === "asc" || searchParams.sortOrder === "desc"
      ? searchParams.sortOrder
      : undefined;

  let initialData: Pricing[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: PricingStats = EMPTY_STATS;

  try {
    const [pricingRes, statsRes] = await Promise.all([
      getPricing({
        page: String(page),
        limit: String(limit),
        search,
        sortBy,
        sortOrder,
      }),
      getPricingStats(),
    ]);

    if (pricingRes?.success) {
      initialData = pricingRes.data.pricingList;
      rowCount = pricingRes.data.meta.total ?? 0;
      pageCount = pricingRes.data.meta.total_pages || 1;
      initialPage = (pricingRes.data.meta.page || 1) - 1;
    }

    if (statsRes?.success) {
      initialStats = statsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch pricing page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <PricingClient
          initialData={initialData}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={initialPage}
          pageSize={limit}
          initialStats={initialStats}
        />
      </div>

      <PricingSheet />
      <PricingDetailSheet />
    </div>
  );
}
