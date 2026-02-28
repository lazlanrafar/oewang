"use client";

import type { AdminOrderListing } from "@workspace/types";
import { DataTableServer } from "@workspace/ui";
import { columns } from "./orders-columns";

export interface OrdersViewProps {
  initialOrders: AdminOrderListing[];
  initialTotal?: number;
  initialPageCount?: number;
}

export function OrdersView({
  initialOrders,
  initialTotal = 0,
  initialPageCount,
}: OrdersViewProps) {
  const initialLimit = 10;

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
      </div>

      <div className="flex-1 min-h-0">
        <DataTableServer
          data={initialOrders}
          columns={columns}
          pageCount={initialPageCount as number}
          initialTotal={initialTotal}
          initialLimit={initialLimit}
          searchPlaceholder="Filter orders..."
          initialSearch=""
        />
      </div>
    </div>
  );
}
