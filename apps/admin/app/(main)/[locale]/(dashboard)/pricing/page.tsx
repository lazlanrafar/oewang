"use server";

import { ScrollableContent } from "@workspace/ui";
import { getPricing } from "@workspace/modules/pricing/pricing.action";
import PricingDataTableWrapper from "@/components/pricing/pricing-data-table-wrapper";
import PricingSearchFilter from "@/components/pricing/pricing-search-filter";
import PricingDataTableColumnVisibility from "@/components/pricing/pricing-data-table-column-visibility";
import { PricingSheet } from "@/components/pricing/pricing-sheet";
import { PricingDetailSheet } from "@/components/pricing/pricing-detail-sheet";
import { PricingAddButton } from "@/components/pricing/pricing-add-button";

interface Props {
  searchParams: Promise<{
    search?: string;
    page?: string;
    limit?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}

export default async function PricingPage({ searchParams }: Props) {
  const params = await searchParams;

  const res = await getPricing({
    search: params.search,
    page: params.page ?? "1",
    limit: params.limit ?? "20",
    sortBy: params.sortBy,
    sortOrder: params.sortOrder as "asc" | "desc",
  });

  const pricingList = res.success ? res.data.pricingList : [];
  const pagination = res.success
    ? res.data.meta
    : { total: 0, total_pages: 0, page: 1, limit: 20 };

  return (
    <ScrollableContent className="h-full">
      <div className="flex flex-col h-full bg-background no-scrollbar space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 shrink-0">
          <div>
            <h1 className="text-2xl tracking-tight">Pricing</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage system pricing plans and tiers.
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <PricingSearchFilter />
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2">
              <PricingAddButton />
              <PricingDataTableColumnVisibility />
            </div>
            {/* <TransactionTabs /> */}
          </div>
        </div>

        {/* <div className="flex items-center justify-between gap-4">
          <PricingSearchFilter />
          <PricingAddButton />
          <PricingDataTableColumnVisibility />
        </div> */}

        <div className="flex-1 min-h-0 relative">
          <PricingDataTableWrapper
            initialData={pricingList}
            rowCount={pagination.total}
            pageCount={pagination.total_pages}
            initialPage={pagination.page - 1}
            pageSize={pagination.limit}
          />
        </div>

        <PricingSheet />
        <PricingDetailSheet />
      </div>
    </ScrollableContent>
  );
}
