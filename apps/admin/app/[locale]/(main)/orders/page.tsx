import { Suspense } from "react";
import { getAdminOrders } from "@workspace/modules";
import type { AdminOrderListing } from "@workspace/types";
import { OrdersView } from "@/components/orders/orders-view";

export const dynamic = "force-dynamic";

export default async function OrdersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const page =
    typeof searchParams.page === "string" ? parseInt(searchParams.page) : 1;
  const limit =
    typeof searchParams.limit === "string" ? parseInt(searchParams.limit) : 10;

  let initialOrders: AdminOrderListing[] = [];
  let initialTotal = 0;
  let pageCount = 0;

  try {
    const result = await getAdminOrders({
      page,
      limit,
    });

    if (result.success && result.data) {
      initialOrders = result.data.orders;
      initialTotal = result.data.meta?.total ?? initialOrders.length;
      pageCount = Math.ceil(initialTotal / limit);
    }
  } catch (error) {
    console.error("Failed to fetch initial data for orders page:", error);
  }

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-[calc(100dvh-6rem)] flex flex-col pb-10">
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="p-8 text-center text-muted-foreground">
              Loading orders...
            </div>
          }
        >
          <OrdersView
            initialOrders={initialOrders}
            initialTotal={initialTotal}
            initialPageCount={pageCount}
          />
        </Suspense>
      </div>
    </div>
  );
}
