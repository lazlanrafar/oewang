import {
  getAdminOrderStats,
  getAdminOrders,
} from "@workspace/modules/orders/orders.action";
import type { AdminOrderListing, AdminOrderStats } from "@workspace/types";
import type { Metadata } from "next";

import { OrdersClient } from "@/components/orders/orders-client";
import { OrdersDetailSheet } from "@/components/orders/orders-detail-sheet";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

const EMPTY_STATS: AdminOrderStats = {
  total: 0,
  paid: 0,
  pending: 0,
  failed: 0,
};

export default async function OrdersPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;
  const search =
    typeof searchParams.search === "string" ? searchParams.search : undefined;
  const status =
    typeof searchParams.status === "string" ? searchParams.status : undefined;
  const start =
    typeof searchParams.start === "string" ? searchParams.start : undefined;
  const end =
    typeof searchParams.end === "string" ? searchParams.end : undefined;

  let initialData: AdminOrderListing[] = [];
  let rowCount = 0;
  let pageCount = 1;
  let initialPage = page - 1;
  let initialStats: AdminOrderStats = EMPTY_STATS;

  try {
    const [ordersRes, statsRes] = await Promise.all([
      getAdminOrders({ page, limit, search, status, start, end }),
      getAdminOrderStats({ start, end }),
    ]);

    if (ordersRes?.success) {
      initialData = ordersRes.data.orders;
      rowCount = ordersRes.data.meta.total;
      pageCount = ordersRes.data.meta.total_pages || 1;
      initialPage = (ordersRes.data.meta.page || 1) - 1;
    }

    if (statsRes?.success) {
      initialStats = statsRes.data;
    }
  } catch (error) {
    console.error("Failed to fetch orders page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-full flex-col bg-background">
      <div className="no-scrollbar min-h-0 flex-1">
        <OrdersClient
          initialData={initialData}
          rowCount={rowCount}
          pageCount={pageCount}
          initialPage={initialPage}
          pageSize={limit}
          initialStats={initialStats}
          initialStart={start ?? null}
          initialEnd={end ?? null}
        />
      </div>

      <OrdersDetailSheet />
    </div>
  );
}
