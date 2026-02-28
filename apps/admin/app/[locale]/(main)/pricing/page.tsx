import { Suspense } from "react";
import { getPricing } from "@workspace/modules";
import type { Pricing } from "@workspace/types";
import { PricingView } from "@/components/pricing/pricing-view";

export const dynamic = "force-dynamic";

export default async function PricingPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page =
    typeof searchParams.page === "string" ? searchParams.page : undefined;
  const limit =
    typeof searchParams.limit === "string" ? searchParams.limit : undefined;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const is_active =
    typeof searchParams.is_active === "string"
      ? searchParams.is_active
      : undefined;
  const sortBy =
    typeof searchParams.sortBy === "string" ? searchParams.sortBy : undefined;
  const sortOrder =
    typeof searchParams.sortOrder === "string"
      ? (searchParams.sortOrder as "asc" | "desc")
      : undefined;

  let initialPricing: Pricing[] = [];
  let initialTotal = 0;

  try {
    const result = await getPricing({
      page,
      limit,
      search,
      is_active,
      sortBy,
      sortOrder,
    });

    if (result.success && result.data) {
      initialPricing = result.data.pricingList;
      initialTotal = result.data.meta?.total ?? initialPricing.length;
    }
  } catch (error) {
    console.error("Failed to fetch initial data for pricing page:", error);
  }

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col pb-10">
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="p-8 text-center text-muted-foreground">
              Loading pricing plans...
            </div>
          }
        >
          <PricingView
            initialPricing={initialPricing}
            initialTotal={initialTotal}
            initialSearch={search}
            initialIsActive={is_active}
            initialSortBy={sortBy}
            initialSortOrder={sortOrder}
          />
        </Suspense>
      </div>
    </div>
  );
}
